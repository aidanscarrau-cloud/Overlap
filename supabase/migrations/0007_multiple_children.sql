-- Overlap: link one account to several players (e.g. a parent with two children)
-- Moves memberships.player_id into a member_players table. Safe to run more than once.

create table if not exists public.member_players (
  membership_id uuid not null references public.memberships (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete cascade,
  primary key (membership_id, player_id)
);
create index if not exists member_players_player_idx on public.member_players (player_id);

create or replace function public.check_member_player_link() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select club_id into new.club_id from public.memberships where id = new.membership_id;
  if new.club_id is null or not exists (select 1 from public.players where id = new.player_id and club_id = new.club_id) then
    raise exception 'Player is not in this club';
  end if;
  return new;
end $$;
drop trigger if exists member_players_club on public.member_players;
create trigger member_players_club before insert or update on public.member_players
  for each row execute function public.check_member_player_link();

alter table public.member_players enable row level security;
drop policy if exists member_players_read on public.member_players;
drop policy if exists member_players_insert on public.member_players;
drop policy if exists member_players_delete on public.member_players;
create policy member_players_read on public.member_players for select to authenticated
  using (public.sees_members(club_id) or exists (select 1 from public.memberships m where m.id = membership_id and m.user_id = auth.uid()));
create policy member_players_insert on public.member_players for insert to authenticated with check (public.is_admin(club_id));
create policy member_players_delete on public.member_players for delete to authenticated using (public.is_admin(club_id));
grant select, insert, delete on public.member_players to authenticated;

-- ---------- Helpers now read member_players ----------
create or replace function public.is_linked_player(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.member_players mp join public.memberships m on m.id = mp.membership_id
    where m.user_id = auth.uid() and mp.player_id = pid
  )
$$;

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
  )
$$;

create or replace function public.attendance_visible(sid uuid, pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.sessions s where s.id = sid and public.can_view_team(s.team_id) and public.has_perm(s.club_id, 'attendance.view')
  ) or public.is_linked_player(pid)
$$;

create or replace function public.get_player_notes(c uuid) returns table (player_id uuid, status_note text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.status_note from public.players p
  where p.club_id = c and p.status_note <> '' and public.can_view_team(p.team_id)
    and (public.has_perm(c, 'squad.view_notes') or public.is_linked_player(p.id))
$$;

create or replace function public.set_availability(p_player uuid, p_status public.player_status, p_note text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare p_team uuid;
begin
  select team_id into p_team from public.players where id = p_player;
  if p_team is null then raise exception 'Player not found'; end if;
  if not (public.can_do(p_team, 'squad.edit') or public.is_linked_player(p_player)) then
    raise exception 'You can only update your own availability';
  end if;
  update public.players set status = p_status, status_note = left(coalesce(p_note, ''), 120) where id = p_player;
end $$;

create or replace function public.reply_to_session(p_session uuid, p_player uuid, p_going boolean, p_note text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare s public.sessions; p public.players;
begin
  select * into s from public.sessions where id = p_session;
  select * into p from public.players where id = p_player;
  if s.id is null or p.id is null then raise exception 'Session or player not found'; end if;
  if p.team_id <> s.team_id then raise exception 'That player is not in this session''s team'; end if;
  if s.date < (now() at time zone 'utc')::date - 1 then raise exception 'This session has already happened'; end if;
  if not (public.is_linked_player(p_player) or public.can_do(s.team_id, 'attendance.edit')) then
    raise exception 'You can only reply for yourself or your children';
  end if;
  insert into public.session_replies (session_id, player_id, club_id, going, note, replied_by, updated_at)
  values (p_session, p_player, s.club_id, p_going, left(coalesce(p_note, ''), 120), auth.uid(), now())
  on conflict (session_id, player_id) do update
    set going = excluded.going, note = excluded.note, replied_by = excluded.replied_by, updated_at = now();
end $$;

-- Joining: an existing parent or player who enters an invite for another player gets that player added.
create or replace function public.join_club(invite_code text, your_name text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare inv public.invites; mid uuid; mrole public.member_role;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into inv from public.invites where code = upper(trim(invite_code)) for update;
  if not found then raise exception 'That invite code does not exist. Check it and try again.'; end if;
  if inv.expires_at < now() then raise exception 'That invite code has expired. Ask your club for a new one.'; end if;
  if inv.uses >= inv.max_uses then raise exception 'That invite code has already been used. Ask your club for a new one.'; end if;

  select id, role into mid, mrole from public.memberships where club_id = inv.club_id and user_id = auth.uid();
  if mid is not null then
    if inv.player_id is null or mrole not in ('player', 'parent') then
      raise exception 'You are already a member of this club.';
    end if;
    if exists (select 1 from public.member_players where membership_id = mid and player_id = inv.player_id) then
      raise exception 'That player is already linked to your account.';
    end if;
  else
    insert into public.profiles (id, full_name) values (auth.uid(), left(coalesce(your_name, ''), 80))
      on conflict (id) do update set full_name = case when excluded.full_name <> '' then excluded.full_name else public.profiles.full_name end;
    insert into public.memberships (club_id, user_id, role) values (inv.club_id, auth.uid(), inv.role) returning id into mid;
  end if;

  if inv.player_id is not null then
    insert into public.member_players (membership_id, player_id, club_id) values (mid, inv.player_id, inv.club_id) on conflict do nothing;
  end if;
  if inv.team_id is not null then
    insert into public.member_teams (membership_id, team_id, club_id) values (mid, inv.team_id, inv.club_id) on conflict do nothing;
  end if;
  update public.invites set uses = uses + 1 where code = inv.code;
  return inv.club_id;
end $$;

-- ---------- Move existing links, then retire the old column ----------
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'memberships' and column_name = 'player_id') then
    insert into public.member_players (membership_id, player_id, club_id)
      select id, player_id, club_id from public.memberships where player_id is not null
      on conflict do nothing;
    drop trigger if exists memberships_player_link on public.memberships;
    alter table public.memberships drop column player_id;
  end if;
end $$;
