-- Overlap: line-ups and fitness are for coaching staff only. Players and parents can still see the
-- schedule, whether their own child is in a match squad, results and goal scorers, but not who starts,
-- positions, saved team line-ups or fitness test results. Safe to run more than once.

-- ---------- Match squads: families only see their own child's row ----------
drop policy if exists match_players_read on public.match_players;
create policy match_players_read on public.match_players for select to authenticated using (
  exists (
    select 1 from public.matches m where m.id = match_id and public.can_view_team(m.team_id) and public.is_coaching_staff(m.club_id)
  ) or (public.is_linked_player(player_id) and exists (
    select 1 from public.matches m where m.id = match_id and (m.squad_published or m.status = 'played')
  ))
);

-- Goal scorers of played matches, for everyone who can see the team (names and goals only).
create or replace function public.match_scorers()
returns table (match_id uuid, full_name text, goals int)
language sql stable security definer set search_path = '' as $$
  select mp.match_id, p.full_name, mp.goals
  from public.match_players mp
  join public.matches m on m.id = mp.match_id
  join public.players p on p.id = mp.player_id
  where m.status = 'played' and mp.goals > 0 and public.can_view_team(m.team_id)
$$;
grant execute on function public.match_scorers() to authenticated;

-- ---------- Saved team line-ups: coaching staff only ----------
drop policy if exists team_lineups_read on public.team_lineups;
create policy team_lineups_read on public.team_lineups for select to authenticated
  using (public.can_view_team(team_id) and public.is_coaching_staff(club_id));

-- "Save & share" now tells the team's coaching staff (coaches, assistants, admins), not players and parents.
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

  if p_notify then
    insert into public.notifications (user_id, club_id, kind, title, body, url, dedupe)
    select a.user_id, t.club_id, 'squad', left('Line-up updated: ' || t.name, 200),
      left(coalesce(nullif(p_formation, ''), p_format || '-a-side') || '. Coaching staff only.', 300), '/squad', 'lineup:' || t.id
    from public.teams t, (
      select m.user_id from public.memberships m join public.member_teams mt on mt.membership_id = m.id
        where mt.team_id = p_team and m.role::text in ('coach', 'assistant')
      union select m.user_id from public.memberships m join public.teams tt on tt.club_id = m.club_id where tt.id = p_team and m.role::text = 'admin'
    ) a
    where t.id = p_team and a.user_id is distinct from auth.uid()
    on conflict (user_id, dedupe) do update set title = excluded.title, body = excluded.body, created_at = now(), read_at = null, pushed_at = null;
  end if;
end $$;
grant execute on function public.save_team_lineup(uuid, text, text, jsonb, boolean) to authenticated;
-- Old line-up notifications that went to families point at a page they can no longer see.
delete from public.notifications n using public.memberships m
  where n.dedupe like 'lineup:%' and m.user_id = n.user_id and m.club_id = n.club_id and m.role::text in ('parent', 'player');

-- ---------- Fitness: coaching staff only ----------
drop policy if exists fitness_days_read on public.fitness_test_days;
create policy fitness_days_read on public.fitness_test_days for select to authenticated
  using (public.can_view_team(team_id) and public.is_coaching_staff(club_id));
drop policy if exists fitness_results_read on public.fitness_results;
create policy fitness_results_read on public.fitness_results for select to authenticated
  using (public.can_view_team(team_id) and public.is_coaching_staff(club_id) and public.has_perm(club_id, 'attendance.view'));
create or replace function public.fitness_leaderboard_allowed(p_team uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.can_view_team(p_team) and public.is_coaching_staff((select club_id from public.teams where id = p_team))
    and public.has_perm((select club_id from public.teams where id = p_team), 'attendance.view')
$$;

notify pgrst, 'reload schema';
