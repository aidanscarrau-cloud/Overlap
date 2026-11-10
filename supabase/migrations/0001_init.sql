-- Overlap: initial schema
-- Clubs contain teams, players, drills and sessions. People join a club through
-- a membership with one role: admin, coach, player or parent.
-- Row level security decides what each role can read and change.

create extension if not exists pgcrypto with schema extensions;

-- ---------- Types ----------
create type public.member_role as enum ('admin', 'coach', 'player', 'parent');
create type public.player_status as enum ('available', 'injured', 'unavailable');
create type public.player_position as enum ('GK', 'DEF', 'MID', 'FWD');
create type public.drill_category as enum ('warmup', 'technical', 'tactical', 'game', 'fitness', 'cooldown');

-- ---------- Tables ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 80),
  created_at timestamptz not null default now()
);

create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now()
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  age_group text not null default '' check (char_length(age_group) <= 40),
  coach_name text not null default '' check (char_length(coach_name) <= 80),
  created_at timestamptz not null default now()
);
create index teams_club_idx on public.teams (club_id);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 80),
  shirt_number int check (shirt_number between 1 and 99),
  position public.player_position not null default 'MID',
  status public.player_status not null default 'available',
  status_note text not null default '' check (char_length(status_note) <= 120),
  created_at timestamptz not null default now()
);
create index players_club_idx on public.players (club_id);
create index players_team_idx on public.players (team_id);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.member_role not null,
  team_id uuid references public.teams (id) on delete set null,
  player_id uuid references public.players (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (club_id, user_id)
);
create index memberships_user_idx on public.memberships (user_id);

create table public.invites (
  code text primary key,
  club_id uuid not null references public.clubs (id) on delete cascade,
  role public.member_role not null,
  team_id uuid references public.teams (id) on delete cascade,
  player_id uuid references public.players (id) on delete cascade,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  expires_at timestamptz not null default now() + interval '14 days',
  max_uses int not null default 1 check (max_uses between 1 and 500),
  uses int not null default 0,
  created_at timestamptz not null default now()
);
create index invites_club_idx on public.invites (club_id);

create table public.drills (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  category public.drill_category not null default 'technical',
  minutes int not null default 15 check (minutes between 1 and 180),
  player_count text not null default '' check (char_length(player_count) <= 30),
  area text not null default '' check (char_length(area) <= 40),
  description text not null default '' check (char_length(description) <= 2000),
  points text[] not null default '{}',
  diagram jsonb not null default '{"items": [], "arrows": [], "full": false}',
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index drills_club_idx on public.drills (club_id);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  date date not null,
  start_time time not null default '18:00',
  location text not null default '' check (char_length(location) <= 80),
  title text not null default 'Training session' check (char_length(title) <= 100),
  focus text not null default '' check (char_length(focus) <= 60),
  notes text not null default '' check (char_length(notes) <= 5000),
  plan jsonb not null default '[]', -- ordered list of {"drill_id": uuid, "mins": int}
  created_at timestamptz not null default now()
);
create index sessions_club_idx on public.sessions (club_id, date);
create index sessions_team_idx on public.sessions (team_id, date);

create table public.attendance (
  session_id uuid not null references public.sessions (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete cascade,
  primary key (session_id, player_id)
);
create index attendance_club_idx on public.attendance (club_id);

-- ---------- Keep club_id consistent ----------
-- Rows that belong to a team or session always take their club from it,
-- so nobody can attach a row to a club they are not in.
create function public.set_club_from_team() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select t.club_id into new.club_id from public.teams t where t.id = new.team_id;
  if new.club_id is null then raise exception 'Team not found'; end if;
  return new;
end $$;

create trigger players_club before insert or update on public.players
  for each row execute function public.set_club_from_team();
create trigger sessions_club before insert or update on public.sessions
  for each row execute function public.set_club_from_team();

create function public.set_club_from_session() returns trigger
language plpgsql security definer set search_path = '' as $$
declare p_club uuid;
begin
  select s.club_id into new.club_id from public.sessions s where s.id = new.session_id;
  select p.club_id into p_club from public.players p where p.id = new.player_id;
  if new.club_id is null or p_club is distinct from new.club_id then
    raise exception 'Player and session must belong to the same club';
  end if;
  return new;
end $$;

create trigger attendance_club before insert or update on public.attendance
  for each row execute function public.set_club_from_session();

create function public.check_membership_links() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.team_id is not null and not exists (select 1 from public.teams where id = new.team_id and club_id = new.club_id) then
    raise exception 'Team is not in this club';
  end if;
  if new.player_id is not null and not exists (select 1 from public.players where id = new.player_id and club_id = new.club_id) then
    raise exception 'Player is not in this club';
  end if;
  return new;
end $$;

create trigger memberships_links before insert or update on public.memberships
  for each row execute function public.check_membership_links();
create trigger invites_links before insert or update on public.invites
  for each row execute function public.check_membership_links();

-- ---------- Profiles for new accounts ----------
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 80))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Role helpers (used by policies) ----------
create function public.club_role(c uuid) returns public.member_role
language sql stable security definer set search_path = '' as $$
  select role from public.memberships where club_id = c and user_id = auth.uid()
$$;

create function public.is_member(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships where club_id = c and user_id = auth.uid())
$$;

create function public.is_staff(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships where club_id = c and user_id = auth.uid() and role in ('admin', 'coach'))
$$;

create function public.is_admin(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships where club_id = c and user_id = auth.uid() and role = 'admin')
$$;

create function public.shares_club(other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships a join public.memberships b on a.club_id = b.club_id
    where a.user_id = auth.uid() and b.user_id = other
  )
$$;

-- ---------- Row level security ----------
alter table public.profiles enable row level security;
alter table public.clubs enable row level security;
alter table public.teams enable row level security;
alter table public.players enable row level security;
alter table public.memberships enable row level security;
alter table public.invites enable row level security;
alter table public.drills enable row level security;
alter table public.sessions enable row level security;
alter table public.attendance enable row level security;

-- Profiles: you, and people in your clubs, can see your name. Only you can change it.
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_club(id));
create policy profiles_insert on public.profiles for insert to authenticated
  with check (id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Clubs: members read; admins rename. Clubs are created through create_club().
create policy clubs_read on public.clubs for select to authenticated using (public.is_member(id));
create policy clubs_update on public.clubs for update to authenticated
  using (public.is_admin(id)) with check (public.is_admin(id));

-- Teams: members read; admins manage.
create policy teams_read on public.teams for select to authenticated using (public.is_member(club_id));
create policy teams_insert on public.teams for insert to authenticated with check (public.is_admin(club_id));
create policy teams_update on public.teams for update to authenticated
  using (public.is_admin(club_id)) with check (public.is_admin(club_id));
create policy teams_delete on public.teams for delete to authenticated using (public.is_admin(club_id));

-- Players, drills, sessions, attendance: members read; admins and coaches manage.
create policy players_read on public.players for select to authenticated using (public.is_member(club_id));
create policy players_insert on public.players for insert to authenticated with check (public.is_staff(club_id));
create policy players_update on public.players for update to authenticated
  using (public.is_staff(club_id)) with check (public.is_staff(club_id));
create policy players_delete on public.players for delete to authenticated using (public.is_staff(club_id));

create policy drills_read on public.drills for select to authenticated using (public.is_member(club_id));
create policy drills_insert on public.drills for insert to authenticated with check (public.is_staff(club_id));
create policy drills_update on public.drills for update to authenticated
  using (public.is_staff(club_id)) with check (public.is_staff(club_id));
create policy drills_delete on public.drills for delete to authenticated using (public.is_staff(club_id));

create policy sessions_read on public.sessions for select to authenticated using (public.is_member(club_id));
create policy sessions_insert on public.sessions for insert to authenticated with check (public.is_staff(club_id));
create policy sessions_update on public.sessions for update to authenticated
  using (public.is_staff(club_id)) with check (public.is_staff(club_id));
create policy sessions_delete on public.sessions for delete to authenticated using (public.is_staff(club_id));

create policy attendance_read on public.attendance for select to authenticated using (public.is_member(club_id));
create policy attendance_insert on public.attendance for insert to authenticated with check (public.is_staff(club_id));
create policy attendance_delete on public.attendance for delete to authenticated using (public.is_staff(club_id));

-- Memberships: members see who is in the club. Admins change roles and remove
-- people, but never their own membership (so a club always keeps an admin).
-- Anyone may leave a club unless they are its admin.
create policy memberships_read on public.memberships for select to authenticated using (public.is_member(club_id));
create policy memberships_update on public.memberships for update to authenticated
  using (public.is_admin(club_id) and user_id <> auth.uid())
  with check (public.is_admin(club_id) and user_id <> auth.uid());
create policy memberships_delete on public.memberships for delete to authenticated
  using ((public.is_admin(club_id) and user_id <> auth.uid()) or (user_id = auth.uid() and role <> 'admin'));

-- Invites: admins manage all invites; coaches may invite players and parents.
create policy invites_read on public.invites for select to authenticated using (public.is_staff(club_id));
create policy invites_insert on public.invites for insert to authenticated
  with check (public.is_admin(club_id) or (public.is_staff(club_id) and role in ('player', 'parent')));
create policy invites_delete on public.invites for delete to authenticated
  using (public.is_admin(club_id) or (public.is_staff(club_id) and role in ('player', 'parent')));

-- ---------- Functions the app calls ----------
create function public.new_invite_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text := '';
  bytes bytea := extensions.gen_random_bytes(8);
begin
  for i in 0..7 loop
    code := code || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  return code;
end $$;

alter table public.invites alter column code set default public.new_invite_code();

-- Create a club; the caller becomes its admin.
create function public.create_club(club_name text, your_name text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  insert into public.profiles (id, full_name) values (auth.uid(), left(coalesce(your_name, ''), 80))
    on conflict (id) do update set full_name = case when excluded.full_name <> '' then excluded.full_name else public.profiles.full_name end;
  insert into public.clubs (name) values (trim(club_name)) returning id into new_id;
  insert into public.memberships (club_id, user_id, role) values (new_id, auth.uid(), 'admin');
  return new_id;
end $$;

-- Join a club with an invite code.
create function public.join_club(invite_code text, your_name text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare inv public.invites;
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
  insert into public.memberships (club_id, user_id, role, team_id, player_id)
    values (inv.club_id, auth.uid(), inv.role, inv.team_id, inv.player_id);
  update public.invites set uses = uses + 1 where code = inv.code;
  return inv.club_id;
end $$;

-- Players (and parents) update their own linked player's availability.
-- Coaches and admins can update anyone's.
create function public.set_availability(p_player uuid, p_status public.player_status, p_note text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare p_club uuid;
begin
  select club_id into p_club from public.players where id = p_player;
  if p_club is null then raise exception 'Player not found'; end if;
  if not (
    public.is_staff(p_club)
    or exists (select 1 from public.memberships where club_id = p_club and user_id = auth.uid() and player_id = p_player)
  ) then
    raise exception 'You can only update your own availability';
  end if;
  update public.players set status = p_status, status_note = left(coalesce(p_note, ''), 120) where id = p_player;
end $$;

-- Only signed-in users may call the app functions.
revoke execute on function public.create_club(text, text) from public, anon;
revoke execute on function public.join_club(text, text) from public, anon;
revoke execute on function public.set_availability(uuid, public.player_status, text) from public, anon;
grant execute on function public.create_club(text, text) to authenticated;
grant execute on function public.join_club(text, text) to authenticated;
grant execute on function public.set_availability(uuid, public.player_status, text) to authenticated;
