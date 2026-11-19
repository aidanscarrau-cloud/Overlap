-- Overlap: fitness testing. Test days, results (one row per attempt), club overrides for the
-- rough-guide age bands, and a leaderboard players and parents can see from U13 up.
-- Coaches and assistants (attendance.edit) plan test days and record results; anyone who can see
-- attendance sees the team's results; players and parents always see their own. Safe to run more than once.

create table if not exists public.fitness_test_days (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  date date not null,
  title text not null default 'Test day' check (char_length(title) <= 60),
  tests text[] not null default '{}' check (cardinality(tests) between 1 and 15),
  notes text not null default '' check (char_length(notes) <= 1000),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists fitness_test_days_team on public.fitness_test_days (team_id, date);

create table if not exists public.fitness_results (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  test_day_id uuid references public.fitness_test_days(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  test_key text not null check (test_key ~ '^[a-z0-9_]{2,30}$'),
  attempt int not null default 1 check (attempt between 1 and 5),
  value numeric not null check (value >= 0 and value < 100000),
  tested_on date not null default current_date,
  recorded_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
drop index if exists public.fitness_results_one;
create unique index fitness_results_one on public.fitness_results (test_day_id, player_id, test_key, attempt);
create index if not exists fitness_results_player on public.fitness_results (player_id, test_key, tested_on);
create index if not exists fitness_results_team on public.fitness_results (team_id, test_key);

create table if not exists public.fitness_bands (
  club_id uuid not null references public.clubs(id) on delete cascade,
  test_key text not null check (test_key ~ '^[a-z0-9_]{2,30}$'),
  age_group text not null check (age_group in ('u10', 'u12', 'u14', 'u16', 'open')),
  typical_low numeric not null,
  typical_high numeric not null check (typical_high > typical_low),
  updated_at timestamptz not null default now(),
  primary key (club_id, test_key, age_group)
);

-- The club and team come from the database, never from what the app sends.
create or replace function public.prepare_fitness_day() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select club_id into new.club_id from public.teams where id = new.team_id;
  if tg_op = 'INSERT' then new.created_by := auth.uid(); end if;
  return new;
end $$;
drop trigger if exists fitness_days_prepare on public.fitness_test_days;
create trigger fitness_days_prepare before insert or update on public.fitness_test_days for each row execute function public.prepare_fitness_day();

create or replace function public.prepare_fitness_result() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select club_id into new.club_id from public.teams where id = new.team_id;
  if new.test_day_id is not null then
    select date into new.tested_on from public.fitness_test_days where id = new.test_day_id and team_id = new.team_id;
    if new.tested_on is null then raise exception 'That test day belongs to another team.'; end if;
  end if;
  if not public.player_in_team(new.player_id, new.team_id) then raise exception 'That player isn''t in this team.'; end if;
  new.recorded_by := auth.uid();
  return new;
end $$;
drop trigger if exists fitness_results_prepare on public.fitness_results;
create trigger fitness_results_prepare before insert or update on public.fitness_results for each row execute function public.prepare_fitness_result();

alter table public.fitness_test_days enable row level security;
alter table public.fitness_results enable row level security;
alter table public.fitness_bands enable row level security;

drop policy if exists fitness_days_read on public.fitness_test_days;
drop policy if exists fitness_days_write on public.fitness_test_days;
create policy fitness_days_read on public.fitness_test_days for select to authenticated using (public.can_view_team(team_id));
create policy fitness_days_write on public.fitness_test_days for all to authenticated
  using (public.can_do(team_id, 'attendance.edit')) with check (public.can_do(team_id, 'attendance.edit'));
grant select, insert, update, delete on public.fitness_test_days to authenticated;

drop policy if exists fitness_results_read on public.fitness_results;
drop policy if exists fitness_results_write on public.fitness_results;
create policy fitness_results_read on public.fitness_results for select to authenticated
  using ((public.can_view_team(team_id) and public.has_perm(club_id, 'attendance.view')) or public.is_linked_player(player_id));
create policy fitness_results_write on public.fitness_results for all to authenticated
  using (public.can_do(team_id, 'attendance.edit')) with check (public.can_do(team_id, 'attendance.edit'));
grant select, insert, update, delete on public.fitness_results to authenticated;

drop policy if exists fitness_bands_read on public.fitness_bands;
drop policy if exists fitness_bands_write on public.fitness_bands;
create policy fitness_bands_read on public.fitness_bands for select to authenticated using (public.is_member(club_id));
create policy fitness_bands_write on public.fitness_bands for all to authenticated
  using (public.is_staff(club_id)) with check (public.is_staff(club_id));
grant select, insert, update, delete on public.fitness_bands to authenticated;

-- A team's age from its name or age group ("U14 Girls" -> 14). Null for open-age teams.
create or replace function public.team_age(t uuid) returns int
language sql stable security definer set search_path = '' as $$
  select (regexp_match(coalesce(tt.name, '') || ' ' || coalesce(tt.age_group, ''), '\mU\s?(\d{1,2})\M', 'i'))[1]::int from public.teams tt where tt.id = t
$$;

-- Best result per player for one test. Coaches always; players and parents only for U13 and older teams.
create or replace function public.fitness_leaderboard_allowed(p_team uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.can_view_team(p_team) and (
    public.has_perm((select club_id from public.teams where id = p_team), 'attendance.view')
    or coalesce(public.team_age(p_team), 99) >= 13)
$$;
drop function if exists public.fitness_leaderboard(uuid, text, boolean);
create or replace function public.fitness_leaderboard(p_team uuid, p_test text, p_lower_better boolean)
returns table (player_id uuid, full_name text, shirt_number int, best numeric, previous_best numeric, last_tested date)
language sql stable security definer set search_path = '' as $$
  with r as (
    select fr.player_id as pid, fr.value as v, fr.tested_on as d from public.fitness_results fr
    where public.fitness_leaderboard_allowed(p_team) and fr.team_id = p_team and fr.test_key = p_test
      and public.player_in_team(fr.player_id, p_team)
  ), latest as (select pid, max(d) as ld from r group by pid),
  agg as (
    select r.pid,
      case when p_lower_better then min(r.v) else max(r.v) end as best,
      case when p_lower_better then min(r.v) filter (where r.d < l.ld) else max(r.v) filter (where r.d < l.ld) end as prev,
      l.ld
    from r join latest l on l.pid = r.pid group by r.pid, l.ld
  )
  select p.id, p.full_name, p.shirt_number, a.best, a.prev, a.ld
  from agg a join public.players p on p.id = a.pid
  order by case when p_lower_better then a.best end asc, case when not p_lower_better then a.best end desc, p.full_name
$$;
grant execute on function public.fitness_leaderboard_allowed(uuid) to authenticated;
grant execute on function public.fitness_leaderboard(uuid, text, boolean) to authenticated;
grant execute on function public.team_age(uuid) to authenticated;

notify pgrst, 'reload schema';
