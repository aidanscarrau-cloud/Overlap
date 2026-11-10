-- Overlap: individual development plans (IDPs) - evaluations, goals and goal updates
-- Safe to run more than once.

-- ---------- New permission switches ----------
alter table public.role_permissions drop constraint if exists role_permissions_perm_check;
alter table public.role_permissions add constraint role_permissions_perm_check check (perm in (
  'teams.view_all', 'squad.edit', 'squad.view_notes', 'sessions.edit', 'sessions.view_notes',
  'attendance.edit', 'attendance.view', 'drills.edit', 'members.view', 'invites.create',
  'announcements.post', 'idp.view', 'idp.edit'
));
-- default_perm() gives coaches every switch except teams.view_all, so coaches can see and write IDPs
-- for their teams by default. Players and parents always see their own shared evaluations and goals.

-- ---------- Who wrote it (players may not be able to look up names) ----------
create or replace function public.stamp_author() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.author_id := auth.uid();
    select coalesce(nullif(full_name, ''), 'Club') into new.author_name from public.profiles where id = auth.uid();
    new.author_name := coalesce(new.author_name, 'Club');
  else
    new.author_id := old.author_id;
    new.author_name := old.author_name;
  end if;
  return new;
end $$;

create or replace function public.set_club_from_player() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select club_id into new.club_id from public.players where id = new.player_id;
  if new.club_id is null then raise exception 'Player not found'; end if;
  return new;
end $$;

-- ---------- Evaluations ----------
-- Ratings must use the five areas and be numbers from 1 to 10.
create or replace function public.valid_ratings(r jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(r) = 'object' and not exists (
    select 1 from jsonb_each(r) x
    where x.key not in ('technical', 'tactical', 'physical', 'psychological', 'social')
       or jsonb_typeof(x.value) <> 'number'
       or (x.value)::numeric < 1 or (x.value)::numeric > 10
  )
$$;

-- ratings: {"technical": 1-10, "tactical": .., "physical": .., "psychological": .., "social": ..}
-- comments: same keys, short text per area
create table if not exists public.player_evaluations (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  evaluated_on date not null default current_date,
  ratings jsonb not null default '{}',
  comments jsonb not null default '{}',
  strengths text not null default '' check (char_length(strengths) <= 2000),
  improvements text not null default '' check (char_length(improvements) <= 2000),
  summary text not null default '' check (char_length(summary) <= 3000),
  shared boolean not null default true, -- visible to the player and their parents
  author_id uuid references public.profiles (id) on delete set null,
  author_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ratings_valid check (public.valid_ratings(ratings))
);
create index if not exists player_evaluations_player_idx on public.player_evaluations (player_id, evaluated_on desc);
create index if not exists player_evaluations_club_idx on public.player_evaluations (club_id);

drop trigger if exists player_evaluations_club on public.player_evaluations;
create trigger player_evaluations_club before insert or update on public.player_evaluations
  for each row execute function public.set_club_from_player();
drop trigger if exists player_evaluations_author on public.player_evaluations;
create trigger player_evaluations_author before insert or update on public.player_evaluations
  for each row execute function public.stamp_author();

-- ---------- Goals ----------
create table if not exists public.player_goals (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  area text not null default 'technical' check (area in ('technical', 'tactical', 'physical', 'psychological', 'social')),
  title text not null check (char_length(title) between 1 and 140),
  detail text not null default '' check (char_length(detail) <= 2000),
  target_date date,
  status text not null default 'active' check (status in ('active', 'achieved', 'dropped')),
  progress int not null default 0 check (progress between 0 and 100),
  achieved_on date,
  author_id uuid references public.profiles (id) on delete set null,
  author_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists player_goals_player_idx on public.player_goals (player_id);
create index if not exists player_goals_club_idx on public.player_goals (club_id);

create or replace function public.goal_status_dates() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if new.status = 'achieved' then
    new.achieved_on := coalesce(new.achieved_on, current_date);
    new.progress := 100;
  else
    new.achieved_on := null;
  end if;
  return new;
end $$;

drop trigger if exists player_goals_club on public.player_goals;
create trigger player_goals_club before insert or update on public.player_goals
  for each row execute function public.set_club_from_player();
drop trigger if exists player_goals_author on public.player_goals;
create trigger player_goals_author before insert or update on public.player_goals
  for each row execute function public.stamp_author();
drop trigger if exists player_goals_status on public.player_goals;
create trigger player_goals_status before insert or update on public.player_goals
  for each row execute function public.goal_status_dates();

-- ---------- Goal updates (coach notes and player reflections) ----------
create table if not exists public.goal_updates (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.player_goals (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete cascade,
  note text not null check (char_length(note) between 1 and 1000),
  progress int check (progress between 0 and 100),
  by_staff boolean not null default false,
  author_id uuid references public.profiles (id) on delete set null,
  author_name text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists goal_updates_goal_idx on public.goal_updates (goal_id, created_at);

create or replace function public.prepare_goal_update() returns trigger
language plpgsql security definer set search_path = '' as $$
declare g public.player_goals;
begin
  select * into g from public.player_goals where id = new.goal_id;
  if g.id is null then raise exception 'Goal not found'; end if;
  new.club_id := g.club_id;
  new.by_staff := public.can_do_player(g.player_id, 'idp.edit');
  -- Only staff can move the progress bar; players and parents add notes.
  if not new.by_staff then new.progress := null; end if;
  new.created_at := now();
  return new;
end $$;
drop trigger if exists goal_updates_prepare on public.goal_updates;
create trigger goal_updates_prepare before insert on public.goal_updates
  for each row execute function public.prepare_goal_update();
drop trigger if exists goal_updates_author on public.goal_updates;
create trigger goal_updates_author before insert on public.goal_updates
  for each row execute function public.stamp_author();

-- ---------- Access helpers ----------
create or replace function public.sees_idp(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.players p
    where p.id = pid and public.can_view_player(p.id, p.team_id) and public.has_perm(p.club_id, 'idp.view')
  )
$$;

create or replace function public.goal_visible(gid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.player_goals g
    where g.id = gid and (public.sees_idp(g.player_id) or public.is_linked_player(g.player_id))
  )
$$;

-- ---------- Policies ----------
alter table public.player_evaluations enable row level security;
alter table public.player_goals enable row level security;
alter table public.goal_updates enable row level security;

drop policy if exists player_evaluations_read on public.player_evaluations;
drop policy if exists player_evaluations_insert on public.player_evaluations;
drop policy if exists player_evaluations_update on public.player_evaluations;
drop policy if exists player_evaluations_delete on public.player_evaluations;
create policy player_evaluations_read on public.player_evaluations for select to authenticated
  using (public.sees_idp(player_id) or (shared and public.is_linked_player(player_id)));
create policy player_evaluations_insert on public.player_evaluations for insert to authenticated
  with check (public.can_do_player(player_id, 'idp.edit'));
create policy player_evaluations_update on public.player_evaluations for update to authenticated
  using (public.can_do_player(player_id, 'idp.edit')) with check (public.can_do_player(player_id, 'idp.edit'));
create policy player_evaluations_delete on public.player_evaluations for delete to authenticated
  using (public.can_do_player(player_id, 'idp.edit'));

drop policy if exists player_goals_read on public.player_goals;
drop policy if exists player_goals_insert on public.player_goals;
drop policy if exists player_goals_update on public.player_goals;
drop policy if exists player_goals_delete on public.player_goals;
create policy player_goals_read on public.player_goals for select to authenticated
  using (public.sees_idp(player_id) or public.is_linked_player(player_id));
create policy player_goals_insert on public.player_goals for insert to authenticated
  with check (public.can_do_player(player_id, 'idp.edit'));
create policy player_goals_update on public.player_goals for update to authenticated
  using (public.can_do_player(player_id, 'idp.edit')) with check (public.can_do_player(player_id, 'idp.edit'));
create policy player_goals_delete on public.player_goals for delete to authenticated
  using (public.can_do_player(player_id, 'idp.edit'));

drop policy if exists goal_updates_read on public.goal_updates;
drop policy if exists goal_updates_insert on public.goal_updates;
drop policy if exists goal_updates_delete on public.goal_updates;
create policy goal_updates_read on public.goal_updates for select to authenticated using (public.goal_visible(goal_id));
-- Staff who write IDPs, and the player or their parents, can add updates.
create policy goal_updates_insert on public.goal_updates for insert to authenticated
  with check (exists (
    select 1 from public.player_goals g
    where g.id = goal_id and (public.can_do_player(g.player_id, 'idp.edit') or public.is_linked_player(g.player_id))
  ));
create policy goal_updates_delete on public.goal_updates for delete to authenticated
  using (author_id = auth.uid() or exists (
    select 1 from public.player_goals g where g.id = goal_id and public.can_do_player(g.player_id, 'idp.edit')
  ));

grant select, insert, update, delete on public.player_evaluations, public.player_goals to authenticated;
grant select, insert, delete on public.goal_updates to authenticated;
