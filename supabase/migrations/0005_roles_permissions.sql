-- Overlap: team-scoped access and per-role permission switches
--
-- * Admins see and do everything.
-- * Everyone else only sees the teams they belong to (member_teams, or their linked
--   player's team) unless the "teams.view_all" switch is on for their role.
-- * What each role may do is a set of switches per club (role_permissions). Missing
--   switches fall back to default_perm(): coaches get everything except seeing all teams;
--   players and parents get nothing beyond viewing their team and updating their own
--   availability.
-- * Injury/availability notes and session notes can no longer be read straight from the
--   tables; the app asks get_player_notes() and get_session_notes(), which apply the switches.
-- Safe to run more than once.

-- ---------- Which teams each member belongs to (coaches can have several) ----------
create table if not exists public.member_teams (
  membership_id uuid not null references public.memberships (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete cascade,
  primary key (membership_id, team_id)
);
create index if not exists member_teams_team_idx on public.member_teams (team_id);

create or replace function public.check_member_team() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select club_id into new.club_id from public.memberships where id = new.membership_id;
  if new.club_id is null or not exists (select 1 from public.teams where id = new.team_id and club_id = new.club_id) then
    raise exception 'Team is not in this club';
  end if;
  return new;
end $$;
drop trigger if exists member_teams_club on public.member_teams;
create trigger member_teams_club before insert or update on public.member_teams
  for each row execute function public.check_member_team();

-- Memberships now only link a player; teams live in member_teams.
create or replace function public.check_member_player() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.player_id is not null
     and (tg_op = 'INSERT' or new.player_id is distinct from old.player_id)
     and not exists (select 1 from public.players where id = new.player_id and club_id = new.club_id) then
    raise exception 'Player is not in this club';
  end if;
  return new;
end $$;

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'memberships' and column_name = 'team_id') then
    -- Keep everyone's current team.
    insert into public.member_teams (membership_id, team_id, club_id)
      select id, team_id, club_id from public.memberships where team_id is not null
      on conflict do nothing;
    -- Coaches who had "all teams" keep access to every current team.
    insert into public.member_teams (membership_id, team_id, club_id)
      select m.id, t.id, m.club_id from public.memberships m join public.teams t on t.club_id = m.club_id
      where m.role = 'coach' and m.team_id is null
      on conflict do nothing;
    drop trigger if exists memberships_links on public.memberships;
    alter table public.memberships drop column team_id;
  end if;
end $$;

drop trigger if exists memberships_player_link on public.memberships;
create trigger memberships_player_link before insert or update on public.memberships
  for each row execute function public.check_member_player();

-- ---------- Permission switches ----------
create table if not exists public.role_permissions (
  club_id uuid not null references public.clubs (id) on delete cascade,
  role public.member_role not null check (role <> 'admin'),
  perm text not null check (perm in (
    'teams.view_all', 'squad.edit', 'squad.view_notes', 'sessions.edit', 'sessions.view_notes',
    'attendance.edit', 'attendance.view', 'drills.edit', 'members.view', 'invites.create'
  )),
  allowed boolean not null,
  primary key (club_id, role, perm)
);

create or replace function public.default_perm(r public.member_role, p text) returns boolean
language sql immutable set search_path = '' as $$
  select case
    when r = 'admin' then true
    when r = 'coach' then p <> 'teams.view_all'
    else false
  end
$$;

create or replace function public.has_perm(c uuid, p text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case
      when m.role = 'admin' then true
      else coalesce(
        (select rp.allowed from public.role_permissions rp where rp.club_id = c and rp.role = m.role and rp.perm = p),
        public.default_perm(m.role, p))
    end
    from public.memberships m where m.club_id = c and m.user_id = auth.uid()
  ), false)
$$;

-- ---------- Team access helpers ----------
create or replace function public.in_my_teams(t uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.member_teams mt join public.memberships m on m.id = mt.membership_id
    where m.user_id = auth.uid() and mt.team_id = t
  ) or exists (
    select 1 from public.memberships m join public.players p on p.id = m.player_id
    where m.user_id = auth.uid() and p.team_id = t
  )
$$;

-- Teams a person works with: admins manage all; others only their own teams.
create or replace function public.can_manage_team(t uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.teams where id = t and public.is_admin(club_id)) or public.in_my_teams(t)
$$;

create or replace function public.can_view_team(t uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.teams tt
    where tt.id = t and public.is_member(tt.club_id)
      and (public.is_admin(tt.club_id) or public.in_my_teams(t) or public.has_perm(tt.club_id, 'teams.view_all'))
  )
$$;

-- May this person do `p` for team `t`? Needs the switch and the team to be one of theirs.
create or replace function public.can_do(t uuid, p text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.teams tt where tt.id = t and public.can_manage_team(t) and public.has_perm(tt.club_id, p))
$$;

create or replace function public.attendance_visible(sid uuid, pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.sessions s where s.id = sid and public.can_view_team(s.team_id) and public.has_perm(s.club_id, 'attendance.view')
  ) or exists (
    select 1 from public.memberships m where m.user_id = auth.uid() and m.player_id = pid
  )
$$;

create or replace function public.attendance_editable(sid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.sessions s where s.id = sid and public.can_do(s.team_id, 'attendance.edit'))
$$;

create or replace function public.sees_members(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin(c) or public.has_perm(c, 'members.view')
$$;

create or replace function public.sees_profile(other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships a join public.memberships b on a.club_id = b.club_id
    where a.user_id = auth.uid() and b.user_id = other and public.sees_members(a.club_id)
  )
$$;

-- ---------- Policies ----------
alter table public.member_teams enable row level security;
alter table public.role_permissions enable row level security;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.sees_profile(id));

drop policy if exists teams_read on public.teams;
-- Uses the row's own club so a team being created can be returned to the admin who created it.
create policy teams_read on public.teams for select to authenticated
  using (public.is_admin(club_id) or (public.is_member(club_id) and (public.in_my_teams(id) or public.has_perm(club_id, 'teams.view_all'))));

drop policy if exists players_read on public.players;
drop policy if exists players_insert on public.players;
drop policy if exists players_update on public.players;
drop policy if exists players_delete on public.players;
create policy players_read on public.players for select to authenticated using (public.can_view_team(team_id));
create policy players_insert on public.players for insert to authenticated with check (public.can_do(team_id, 'squad.edit'));
create policy players_update on public.players for update to authenticated
  using (public.can_do(team_id, 'squad.edit')) with check (public.can_do(team_id, 'squad.edit'));
create policy players_delete on public.players for delete to authenticated using (public.can_do(team_id, 'squad.edit'));

drop policy if exists sessions_read on public.sessions;
drop policy if exists sessions_insert on public.sessions;
drop policy if exists sessions_update on public.sessions;
drop policy if exists sessions_delete on public.sessions;
create policy sessions_read on public.sessions for select to authenticated using (public.can_view_team(team_id));
create policy sessions_insert on public.sessions for insert to authenticated with check (public.can_do(team_id, 'sessions.edit'));
create policy sessions_update on public.sessions for update to authenticated
  using (public.can_do(team_id, 'sessions.edit')) with check (public.can_do(team_id, 'sessions.edit'));
create policy sessions_delete on public.sessions for delete to authenticated using (public.can_do(team_id, 'sessions.edit'));

drop policy if exists attendance_read on public.attendance;
drop policy if exists attendance_insert on public.attendance;
drop policy if exists attendance_delete on public.attendance;
create policy attendance_read on public.attendance for select to authenticated using (public.attendance_visible(session_id, player_id));
create policy attendance_insert on public.attendance for insert to authenticated with check (public.attendance_editable(session_id));
create policy attendance_delete on public.attendance for delete to authenticated using (public.attendance_editable(session_id));

drop policy if exists drills_insert on public.drills;
drop policy if exists drills_update on public.drills;
drop policy if exists drills_delete on public.drills;
create policy drills_insert on public.drills for insert to authenticated with check (public.has_perm(club_id, 'drills.edit'));
create policy drills_update on public.drills for update to authenticated
  using (public.has_perm(club_id, 'drills.edit')) with check (public.has_perm(club_id, 'drills.edit'));
create policy drills_delete on public.drills for delete to authenticated using (public.has_perm(club_id, 'drills.edit'));

drop policy if exists memberships_read on public.memberships;
create policy memberships_read on public.memberships for select to authenticated
  using (user_id = auth.uid() or public.sees_members(club_id));

drop policy if exists member_teams_read on public.member_teams;
drop policy if exists member_teams_insert on public.member_teams;
drop policy if exists member_teams_delete on public.member_teams;
create policy member_teams_read on public.member_teams for select to authenticated
  using (public.sees_members(club_id) or exists (select 1 from public.memberships m where m.id = membership_id and m.user_id = auth.uid()));
create policy member_teams_insert on public.member_teams for insert to authenticated with check (public.is_admin(club_id));
create policy member_teams_delete on public.member_teams for delete to authenticated using (public.is_admin(club_id));

drop policy if exists role_permissions_read on public.role_permissions;
drop policy if exists role_permissions_write on public.role_permissions;
create policy role_permissions_read on public.role_permissions for select to authenticated using (public.is_member(club_id));
create policy role_permissions_write on public.role_permissions for all to authenticated
  using (public.is_admin(club_id)) with check (public.is_admin(club_id));

drop policy if exists invites_read on public.invites;
drop policy if exists invites_insert on public.invites;
drop policy if exists invites_delete on public.invites;
create policy invites_read on public.invites for select to authenticated
  using (public.is_admin(club_id) or (public.has_perm(club_id, 'invites.create') and role in ('player', 'parent') and team_id is not null and public.can_manage_team(team_id)));
create policy invites_insert on public.invites for insert to authenticated
  with check (public.is_admin(club_id) or (public.has_perm(club_id, 'invites.create') and role in ('player', 'parent') and team_id is not null and public.can_manage_team(team_id)));
create policy invites_delete on public.invites for delete to authenticated
  using (public.is_admin(club_id) or (public.has_perm(club_id, 'invites.create') and role in ('player', 'parent') and team_id is not null and public.can_manage_team(team_id)));

grant select, insert, update, delete on public.member_teams, public.role_permissions to authenticated;

-- ---------- Private columns ----------
-- Notes are read through the functions below, which apply the switches.
revoke select on public.players from anon, authenticated;
grant select (id, club_id, team_id, full_name, shirt_number, position, status, created_at) on public.players to authenticated;
revoke select on public.sessions from anon, authenticated;
grant select (id, club_id, team_id, date, start_time, location, title, focus, plan, created_at) on public.sessions to authenticated;

create or replace function public.get_player_notes(c uuid) returns table (player_id uuid, status_note text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.status_note from public.players p
  where p.club_id = c and p.status_note <> '' and public.can_view_team(p.team_id)
    and (public.has_perm(c, 'squad.view_notes')
         or exists (select 1 from public.memberships m where m.club_id = c and m.user_id = auth.uid() and m.player_id = p.id))
$$;

create or replace function public.get_session_notes(c uuid) returns table (session_id uuid, notes text)
language sql stable security definer set search_path = '' as $$
  select s.id, s.notes from public.sessions s
  where s.club_id = c and s.notes <> '' and public.can_view_team(s.team_id) and public.has_perm(c, 'sessions.view_notes')
$$;

revoke execute on function public.get_player_notes(uuid) from public, anon;
revoke execute on function public.get_session_notes(uuid) from public, anon;
grant execute on function public.get_player_notes(uuid) to authenticated;
grant execute on function public.get_session_notes(uuid) to authenticated;

-- ---------- App functions that touched teams ----------
create or replace function public.set_availability(p_player uuid, p_status public.player_status, p_note text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare p_club uuid; p_team uuid;
begin
  select club_id, team_id into p_club, p_team from public.players where id = p_player;
  if p_club is null then raise exception 'Player not found'; end if;
  if not (
    public.can_do(p_team, 'squad.edit')
    or exists (select 1 from public.memberships where club_id = p_club and user_id = auth.uid() and player_id = p_player)
  ) then
    raise exception 'You can only update your own availability';
  end if;
  update public.players set status = p_status, status_note = left(coalesce(p_note, ''), 120) where id = p_player;
end $$;

create or replace function public.join_club(invite_code text, your_name text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare inv public.invites; new_mid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into inv from public.invites where code = upper(trim(invite_code)) for update;
  if not found then raise exception 'That invite code does not exist. Check it and try again.'; end if;
  if inv.expires_at < now() then raise exception 'That invite code has expired. Ask your club for a new one.'; end if;
  if inv.uses >= inv.max_uses then raise exception 'That invite code has already been used. Ask your club for a new one.'; end if;
  if exists (select 1 from public.memberships where club_id = inv.club_id and user_id = auth.uid()) then
    raise exception 'You are already a member of this club.';
  end if;
  insert into public.profiles (id, full_name) values (auth.uid(), left(coalesce(your_name, ''), 80))
    on conflict (id) do update set full_name = case when excluded.full_name <> '' then excluded.full_name else public.profiles.full_name end;
  insert into public.memberships (club_id, user_id, role, player_id)
    values (inv.club_id, auth.uid(), inv.role, inv.player_id) returning id into new_mid;
  if inv.team_id is not null then
    insert into public.member_teams (membership_id, team_id, club_id) values (new_mid, inv.team_id, inv.club_id);
  end if;
  update public.invites set uses = uses + 1 where code = inv.code;
  return inv.club_id;
end $$;
