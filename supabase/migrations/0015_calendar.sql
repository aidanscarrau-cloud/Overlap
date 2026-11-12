-- Overlap: repeating sessions and phone calendar sync.
-- * Sessions can belong to a series ("every Tuesday until the end of term"). A whole series is
--   created, changed or cancelled in one go, with ONE notification instead of one per session.
-- * Each person can get a private calendar link (iPhone / Google calendar) that lists their sessions.
-- Safe to run more than once.

alter table public.sessions add column if not exists series_id uuid;
-- Session columns are granted one by one (notes stay hidden), so allow reading the new one.
grant select (series_id) on public.sessions to authenticated;
create index if not exists sessions_series_idx on public.sessions (series_id, date) where series_id is not null;

-- ---------- Bulk changes send one summary notification, not one per session ----------
create or replace function public.notify_session_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare s public.sessions; k text; ttl text; bdy text;
begin
  -- Series changes made through the functions below send their own single summary.
  if coalesce(current_setting('overlap.bulk', true), '') = 'on' then return null; end if;
  if tg_op = 'DELETE' then s := old; else s := new; end if;
  if s.date < current_date then return null; end if;
  if tg_op = 'INSERT' then
    k := 'session_new'; ttl := 'New session: ' || s.title;
    bdy := public.session_when(s.date, s.start_time) || coalesce(' at ' || nullif(s.location, ''), '');
  elsif tg_op = 'UPDATE' then
    if new.date = old.date and new.start_time = old.start_time and new.location = old.location then return null; end if;
    k := 'session_changed'; ttl := 'Session changed: ' || s.title;
    bdy := 'Now ' || public.session_when(s.date, s.start_time) || coalesce(' at ' || nullif(s.location, ''), '');
  else
    k := 'session_cancelled'; ttl := 'Session cancelled: ' || s.title;
    bdy := 'It was ' || public.session_when(s.date, s.start_time);
  end if;
  insert into public.notifications (user_id, club_id, kind, title, body, url)
  select a.user_id, s.club_id, k, left(ttl, 200), left(bdy, 300), '/sessions'
  from public.team_audience(s.team_id) a
  where a.user_id is distinct from auth.uid();
  return null;
end $$;

create or replace function public.notify_series(p_team uuid, p_club uuid, p_kind text, p_title text, p_body text)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, club_id, kind, title, body, url)
  select a.user_id, p_club, p_kind, left(p_title, 200), left(p_body, 300), '/sessions'
  from public.team_audience(p_team) a
  where a.user_id is distinct from auth.uid()
$$;
revoke execute on function public.notify_series(uuid, uuid, text, text, text) from public, anon, authenticated;

create or replace function public.series_range(d1 date, d2 date, n int) returns text
language sql immutable set search_path = '' as $$
  select n || case when n = 1 then ' session' else ' sessions' end ||
    case when d1 = d2 then ' on ' || trim(to_char(d1, 'FMDD Mon'))
         else ' from ' || trim(to_char(d1, 'FMDD Mon')) || ' to ' || trim(to_char(d2, 'FMDD Mon')) end
$$;

-- Create a repeating session: one row per date, all sharing a series id.
create or replace function public.create_session_series(
  p_team uuid, p_dates date[], p_start time, p_location text, p_title text, p_focus text, p_plan jsonb, p_notes text default ''
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare sid uuid := gen_random_uuid(); c uuid; d date; n int; first_d date; last_d date; up int;
begin
  if not public.can_do(p_team, 'sessions.edit') then raise exception 'You can''t plan sessions for this team.'; end if;
  select club_id into c from public.teams where id = p_team;
  select count(distinct x), min(x), max(x) into n, first_d, last_d from unnest(p_dates) x;
  if n is null or n < 1 then raise exception 'Choose at least one date.'; end if;
  if n > 104 then raise exception 'A series can have at most 104 sessions.'; end if;
  if first_d < current_date - 366 or last_d > current_date + 731 then raise exception 'Dates must be within two years.'; end if;
  if jsonb_typeof(coalesce(p_plan, '[]'::jsonb)) <> 'array' then raise exception 'Invalid plan.'; end if;

  perform set_config('overlap.bulk', 'on', true);
  foreach d in array (select array_agg(distinct x order by x) from unnest(p_dates) x) loop
    insert into public.sessions (club_id, team_id, date, start_time, location, title, focus, plan, notes, series_id)
    values (c, p_team, d, coalesce(p_start, '18:00'), left(coalesce(p_location, ''), 80), left(coalesce(nullif(trim(p_title), ''), 'Training session'), 100),
            left(coalesce(p_focus, ''), 60), coalesce(p_plan, '[]'::jsonb),
            case when public.has_perm(c, 'sessions.view_notes') then left(coalesce(p_notes, ''), 5000) else '' end, sid);
  end loop;
  perform set_config('overlap.bulk', 'off', true);

  select count(*), min(x), max(x) into up, first_d, last_d from unnest(p_dates) x where x >= current_date;
  if up > 0 then
    perform public.notify_series(p_team, c, 'session_new', 'New sessions: ' || coalesce(nullif(trim(p_title), ''), 'Training session'),
      trim(to_char(first_d, 'FMDay')) || 's at ' || to_char(coalesce(p_start, '18:00'), 'HH24:MI') || coalesce(' at ' || nullif(p_location, ''), '') || ', ' ||
      public.series_range(first_d, last_d, up));
  end if;
  return sid;
end $$;

-- Change this session and every later one in its series (each keeps its own date).
create or replace function public.update_session_series(
  p_session uuid, p_start time, p_location text, p_title text, p_focus text, p_plan jsonb
) returns int
language plpgsql security definer set search_path = '' as $$
declare s public.sessions; n int; moved boolean; last_d date;
begin
  select * into s from public.sessions where id = p_session;
  if not found or s.series_id is null then raise exception 'That session isn''t part of a series.'; end if;
  if not public.can_do(s.team_id, 'sessions.edit') then raise exception 'You can''t change sessions for this team.'; end if;
  if jsonb_typeof(coalesce(p_plan, '[]'::jsonb)) <> 'array' then raise exception 'Invalid plan.'; end if;
  moved := (p_start is distinct from s.start_time) or (coalesce(p_location, '') is distinct from s.location);

  perform set_config('overlap.bulk', 'on', true);
  update public.sessions set start_time = coalesce(p_start, start_time), location = left(coalesce(p_location, ''), 80),
    title = left(coalesce(nullif(trim(p_title), ''), 'Training session'), 100), focus = left(coalesce(p_focus, ''), 60), plan = coalesce(p_plan, '[]'::jsonb)
  where series_id = s.series_id and date >= s.date;
  get diagnostics n = row_count;
  perform set_config('overlap.bulk', 'off', true);

  if moved and s.date >= current_date then
    select max(date) into last_d from public.sessions where series_id = s.series_id and date >= s.date;
    perform public.notify_series(s.team_id, s.club_id, 'session_changed', 'Sessions changed: ' || coalesce(nullif(trim(p_title), ''), s.title),
      'Now ' || trim(to_char(s.date, 'FMDay')) || 's at ' || to_char(coalesce(p_start, s.start_time), 'HH24:MI') || coalesce(' at ' || nullif(p_location, ''), '') || ', ' ||
      public.series_range(s.date, last_d, n));
  end if;
  return n;
end $$;

-- Cancel this session and every later one in its series.
create or replace function public.delete_session_series(p_session uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare s public.sessions; n int; last_d date;
begin
  select * into s from public.sessions where id = p_session;
  if not found or s.series_id is null then raise exception 'That session isn''t part of a series.'; end if;
  if not public.can_do(s.team_id, 'sessions.edit') then raise exception 'You can''t change sessions for this team.'; end if;
  select max(date) into last_d from public.sessions where series_id = s.series_id and date >= s.date;
  perform set_config('overlap.bulk', 'on', true);
  delete from public.sessions where series_id = s.series_id and date >= s.date;
  get diagnostics n = row_count;
  perform set_config('overlap.bulk', 'off', true);
  if s.date >= current_date then
    perform public.notify_series(s.team_id, s.club_id, 'session_cancelled', 'Sessions cancelled: ' || s.title,
      public.series_range(s.date, last_d, n) || ' are cancelled (' || trim(to_char(s.date, 'FMDay')) || 's at ' || to_char(s.start_time, 'HH24:MI') || ')');
  end if;
  return n;
end $$;

revoke execute on function public.create_session_series(uuid, date[], time, text, text, text, jsonb, text) from public, anon;
revoke execute on function public.update_session_series(uuid, time, text, text, text, jsonb) from public, anon;
revoke execute on function public.delete_session_series(uuid) from public, anon;
grant execute on function public.create_session_series(uuid, date[], time, text, text, text, jsonb, text) to authenticated;
grant execute on function public.update_session_series(uuid, time, text, text, text, jsonb) to authenticated;
grant execute on function public.delete_session_series(uuid) to authenticated;

-- ---------- Private calendar links ----------
create table if not exists public.calendar_feeds (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  token text not null unique default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  created_at timestamptz not null default now()
);
alter table public.calendar_feeds enable row level security;
drop policy if exists calendar_feeds_own on public.calendar_feeds;
create policy calendar_feeds_own on public.calendar_feeds for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on public.calendar_feeds from anon, authenticated;
grant select, insert, delete on public.calendar_feeds to authenticated;

-- Sessions for one calendar link: the teams this person works with or plays in, across all their clubs.
-- Session notes are never included. Called by the app's server only.
create or replace function public.calendar_feed(p_token text)
returns table (id uuid, club text, team text, title text, location text, focus text, starts timestamptz, mins int, updated timestamptz)
language sql stable security definer set search_path = '' as $$
  with me as (select user_id from public.calendar_feeds where token = p_token and char_length(p_token) >= 32),
  mem as (select m.* from public.memberships m join me on me.user_id = m.user_id),
  teams_of as (
    select t.id from public.teams t join mem on mem.club_id = t.club_id and mem.role = 'admin'
    union select mt.team_id from public.member_teams mt join mem on mem.id = mt.membership_id
    union select p.team_id from public.member_players mp join mem on mem.id = mp.membership_id join public.players p on p.id = mp.player_id
    union select pt.team_id from public.member_players mp join mem on mem.id = mp.membership_id join public.player_teams pt on pt.player_id = mp.player_id
  )
  select s.id, c.name, t.name, s.title, s.location, s.focus,
    (s.date + s.start_time) at time zone c.timezone,
    greatest(public.session_minutes(s.plan), 0),
    s.created_at
  from public.sessions s
  join teams_of x on x.id = s.team_id
  join public.teams t on t.id = s.team_id
  join public.clubs c on c.id = s.club_id
  where s.date between current_date - 60 and current_date + 400
  order by s.date, s.start_time
$$;
revoke execute on function public.calendar_feed(text) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.calendar_feed(text) to service_role;
  end if;
end $$;

notify pgrst, 'reload schema';
