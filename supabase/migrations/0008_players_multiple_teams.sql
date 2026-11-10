-- Overlap: players can be in more than one team
-- players.team_id stays the player's main team; player_teams adds extra teams.
-- Safe to run more than once.

create table if not exists public.player_teams (
  player_id uuid not null references public.players (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete cascade,
  primary key (player_id, team_id)
);
create index if not exists player_teams_team_idx on public.player_teams (team_id);

create or replace function public.check_player_team() returns trigger
language plpgsql security definer set search_path = '' as $$
declare main_team uuid;
begin
  select club_id, team_id into new.club_id, main_team from public.players where id = new.player_id;
  if new.club_id is null or not exists (select 1 from public.teams where id = new.team_id and club_id = new.club_id) then
    raise exception 'Team is not in this club';
  end if;
  if new.team_id = main_team then
    raise exception 'That is already the player''s main team';
  end if;
  return new;
end $$;
drop trigger if exists player_teams_club on public.player_teams;
create trigger player_teams_club before insert or update on public.player_teams
  for each row execute function public.check_player_team();

-- If a player's main team changes to one of their extra teams, drop the duplicate extra entry.
create or replace function public.tidy_player_teams() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.team_id is distinct from old.team_id then
    delete from public.player_teams where player_id = new.id and team_id = new.team_id;
  end if;
  return new;
end $$;
drop trigger if exists players_tidy_teams on public.players;
create trigger players_tidy_teams after update of team_id on public.players
  for each row execute function public.tidy_player_teams();

-- ---------- Helpers ----------
create or replace function public.player_in_team(pid uuid, t uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.players where id = pid and team_id = t)
      or exists (select 1 from public.player_teams where player_id = pid and team_id = t)
$$;

create or replace function public.can_view_player(pid uuid, main_team uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.can_view_team(main_team)
      or exists (select 1 from public.player_teams pt where pt.player_id = pid and public.can_view_team(pt.team_id))
$$;

-- Any of the player's teams where this person may do `p`.
create or replace function public.can_do_player(pid uuid, p text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.players pl where pl.id = pid and public.can_do(pl.team_id, p))
      or exists (select 1 from public.player_teams pt where pt.player_id = pid and public.can_do(pt.team_id, p))
$$;

-- Linked players' extra teams count as "my teams" too (parents see all their child's teams).
create or replace function public.in_my_teams(t uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.member_teams mt join public.memberships m on m.id = mt.membership_id
    where m.user_id = auth.uid() and mt.team_id = t
  ) or exists (
    select 1 from public.member_players mp
      join public.memberships m on m.id = mp.membership_id
      join public.players p on p.id = mp.player_id
    where m.user_id = auth.uid() and p.team_id = t
  ) or exists (
    select 1 from public.member_players mp
      join public.memberships m on m.id = mp.membership_id
      join public.player_teams pt on pt.player_id = mp.player_id
    where m.user_id = auth.uid() and pt.team_id = t
  )
$$;

-- ---------- Policies ----------
drop policy if exists players_read on public.players;
create policy players_read on public.players for select to authenticated using (public.can_view_player(id, team_id));

alter table public.player_teams enable row level security;
drop policy if exists player_teams_read on public.player_teams;
drop policy if exists player_teams_insert on public.player_teams;
drop policy if exists player_teams_delete on public.player_teams;
create policy player_teams_read on public.player_teams for select to authenticated
  using (public.can_view_team(team_id) or public.is_linked_player(player_id)
         or exists (select 1 from public.players p where p.id = player_id and public.can_view_team(p.team_id)));
-- Adding a player to a team needs squad editing rights for that team, and the player must
-- already be visible to you (so nobody can pull in players from teams they can't see).
create policy player_teams_insert on public.player_teams for insert to authenticated
  with check (public.can_do(team_id, 'squad.edit')
              and public.can_view_player(player_id, (select p.team_id from public.players p where p.id = player_id)));
create policy player_teams_delete on public.player_teams for delete to authenticated using (public.can_do(team_id, 'squad.edit'));
grant select, insert, delete on public.player_teams to authenticated;

-- ---------- Functions that checked a single team ----------
create or replace function public.get_player_notes(c uuid) returns table (player_id uuid, status_note text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.status_note from public.players p
  where p.club_id = c and p.status_note <> '' and public.can_view_player(p.id, p.team_id)
    and (public.has_perm(c, 'squad.view_notes') or public.is_linked_player(p.id))
$$;

create or replace function public.set_availability(p_player uuid, p_status public.player_status, p_note text default '') returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.players where id = p_player) then raise exception 'Player not found'; end if;
  if not (public.can_do_player(p_player, 'squad.edit') or public.is_linked_player(p_player)) then
    raise exception 'You can only update your own availability';
  end if;
  update public.players set status = p_status, status_note = left(coalesce(p_note, ''), 120) where id = p_player;
end $$;

create or replace function public.reply_to_session(p_session uuid, p_player uuid, p_going boolean, p_note text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare s public.sessions;
begin
  select * into s from public.sessions where id = p_session;
  if s.id is null or not exists (select 1 from public.players where id = p_player) then raise exception 'Session or player not found'; end if;
  if not public.player_in_team(p_player, s.team_id) then raise exception 'That player is not in this session''s team'; end if;
  if s.date < (now() at time zone 'utc')::date - 1 then raise exception 'This session has already happened'; end if;
  if not (public.is_linked_player(p_player) or public.can_do(s.team_id, 'attendance.edit')) then
    raise exception 'You can only reply for yourself or your children';
  end if;
  insert into public.session_replies (session_id, player_id, club_id, going, note, replied_by, updated_at)
  values (p_session, p_player, s.club_id, p_going, left(coalesce(p_note, ''), 120), auth.uid(), now())
  on conflict (session_id, player_id) do update
    set going = excluded.going, note = excluded.note, replied_by = excluded.replied_by, updated_at = now();
end $$;
