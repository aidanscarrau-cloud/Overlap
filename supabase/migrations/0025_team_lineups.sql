-- Overlap: each team's chosen formation and line-up on the Squad page.
-- One row per team: match size (5/7/9/11), formation name, and which player stands in which spot.
-- Anyone who can see the team can see it; only people who can edit the squad can change it, and only
-- with players from that team. Safe to run more than once.

create table if not exists public.team_lineups (
  team_id uuid primary key references public.teams(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  format text not null default '11' check (format in ('5', '7', '9', '11')),
  formation text not null default '' check (char_length(formation) <= 20),
  slots jsonb not null default '{}'::jsonb check (jsonb_typeof(slots) = 'object'),
  updated_at timestamptz not null default now()
);
alter table public.team_lineups enable row level security;

drop policy if exists team_lineups_read on public.team_lineups;
create policy team_lineups_read on public.team_lineups for select to authenticated using (public.can_view_team(team_id));
revoke insert, update, delete on public.team_lineups from authenticated;
grant select on public.team_lineups to authenticated;

-- Save a line-up. Spots are {"0": "<player id>", "3": "<player id>", ...}; empty spots are left out.
create or replace function public.save_team_lineup(p_team uuid, p_format text, p_formation text, p_slots jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare k text; v text; seen text[] := '{}';
begin
  if not public.can_do(p_team, 'squad.edit') then raise exception 'Only the team''s coaches can change the line-up.'; end if;
  if p_format not in ('5', '7', '9', '11') then raise exception 'Unknown match size.'; end if;
  if jsonb_typeof(coalesce(p_slots, '{}'::jsonb)) <> 'object' then raise exception 'Bad line-up.'; end if;
  for k, v in select * from jsonb_each_text(coalesce(p_slots, '{}'::jsonb)) loop
    if k !~ '^[0-9]{1,2}$' or v !~* '^[0-9a-f-]{36}$' then raise exception 'Bad line-up.'; end if;
    if v = any(seen) then raise exception 'A player can only be in one spot.'; end if;
    seen := seen || v;
    if not exists (
      select 1 from public.players p
      where p.id = v::uuid and (p.team_id = p_team or exists (select 1 from public.player_teams pt where pt.player_id = p.id and pt.team_id = p_team))
    ) then raise exception 'That player isn''t in this team.'; end if;
  end loop;
  insert into public.team_lineups (team_id, club_id, format, formation, slots, updated_at)
  select p_team, t.club_id, p_format, left(coalesce(p_formation, ''), 20), coalesce(p_slots, '{}'::jsonb), now() from public.teams t where t.id = p_team
  on conflict (team_id) do update set format = excluded.format, formation = excluded.formation, slots = excluded.slots, updated_at = now();
end $$;
grant execute on function public.save_team_lineup(uuid, text, text, jsonb) to authenticated;

notify pgrst, 'reload schema';
