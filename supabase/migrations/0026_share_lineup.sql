-- Overlap: coaches can share a saved line-up with the team, which notifies players and parents.
-- Replaces save_team_lineup with a version that takes p_notify (default off). Safe to run more than once.

drop function if exists public.save_team_lineup(uuid, text, text, jsonb);

-- Save a line-up. Spots are {"0": "<player id>", "3": "<player id>", ...}; empty spots are left out.
create or replace function public.save_team_lineup(p_team uuid, p_format text, p_formation text, p_slots jsonb, p_notify boolean default false)
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

  -- Shared with the team: players and parents get one notification (a later share replaces it, so no pile-up).
  if p_notify then
    insert into public.notifications (user_id, club_id, kind, title, body, url, dedupe)
    select a.user_id, t.club_id, 'squad', left('Line-up set: ' || t.name, 200),
      left(coalesce(nullif(p_formation, ''), p_format || '-a-side') || '. See where everyone is playing.', 300), '/#lineup', 'lineup:' || t.id
    from public.teams t, public.team_audience(p_team) a
    where t.id = p_team and a.user_id is distinct from auth.uid()
    on conflict (user_id, dedupe) do update set title = excluded.title, body = excluded.body, created_at = now(), read_at = null, pushed_at = null;
  end if;
end $$;
grant execute on function public.save_team_lineup(uuid, text, text, jsonb, boolean) to authenticated;

notify pgrst, 'reload schema';
