-- Overlap: notifications (in-app inbox + phone push)
-- The database decides who hears about what; the app's server sends the push messages.
-- Safe to run more than once.

-- Clubs keep their own time zone so "tomorrow" means tomorrow for them.
alter table public.clubs add column if not exists timezone text not null default 'Australia/Sydney';

-- ---------- Inbox ----------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete cascade,
  kind text not null check (kind in ('session_new', 'session_changed', 'session_cancelled', 'announcement', 'reply_reminder', 'evaluation', 'goal')),
  title text not null check (char_length(title) <= 200),
  body text not null default '' check (char_length(body) <= 300),
  url text not null default '/' check (url like '/%'),
  dedupe text,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  pushed_at timestamptz,
  unique (user_id, dedupe)
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_pending_idx on public.notifications (created_at) where pushed_at is null;

alter table public.notifications enable row level security;
drop policy if exists notifications_read on public.notifications;
drop policy if exists notifications_update on public.notifications;
drop policy if exists notifications_delete on public.notifications;
create policy notifications_read on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete to authenticated using (user_id = auth.uid());
-- People can only mark their own as read (or clear them); only the database creates them.
revoke insert, update on public.notifications from anon, authenticated;
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- ---------- Devices that receive push ----------
create table if not exists public.push_subscriptions (
  endpoint text primary key check (endpoint like 'https://%' and char_length(endpoint) <= 1000),
  user_id uuid not null references public.profiles (id) on delete cascade,
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  user_agent text not null default '' check (char_length(user_agent) <= 300),
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
drop policy if exists push_subscriptions_own on public.push_subscriptions;
create policy push_subscriptions_own on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, delete on public.push_subscriptions to authenticated;

-- A shared phone may switch accounts: the device then belongs to whoever turned push on last.
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default '')
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth, user_agent)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth, left(coalesce(p_user_agent, ''), 300))
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
    user_agent = excluded.user_agent, created_at = now();
end $$;
revoke execute on function public.save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;

-- ---------- What each person wants pushed to their phone ----------
create table if not exists public.notification_prefs (
  user_id uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  sessions boolean not null default true,
  announcements boolean not null default true,
  reminders boolean not null default true,
  development boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.notification_prefs enable row level security;
drop policy if exists notification_prefs_own on public.notification_prefs;
create policy notification_prefs_own on public.notification_prefs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update on public.notification_prefs to authenticated;

-- ---------- Who belongs to a team (coaches, players, and parents of its players) ----------
create or replace function public.team_audience(t uuid) returns table (user_id uuid)
language sql stable security definer set search_path = '' as $$
  select m.user_id from public.member_teams mt join public.memberships m on m.id = mt.membership_id where mt.team_id = t
  union
  select m.user_id from public.member_players mp join public.memberships m on m.id = mp.membership_id
    join public.players p on p.id = mp.player_id where p.team_id = t
  union
  select m.user_id from public.member_players mp join public.memberships m on m.id = mp.membership_id
    join public.player_teams pt on pt.player_id = mp.player_id where pt.team_id = t
$$;
revoke execute on function public.team_audience(uuid) from public, anon, authenticated;

create or replace function public.session_when(d date, t time) returns text
language sql immutable set search_path = '' as $$
  select trim(to_char(d, 'Dy FMDD Mon')) || ', ' || to_char(t, 'HH24:MI')
$$;

-- ---------- Sessions: new, moved, cancelled ----------
create or replace function public.notify_session_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare s public.sessions; k text; ttl text; bdy text;
begin
  if tg_op = 'DELETE' then s := old; else s := new; end if;
  if s.date < current_date then return null; end if;
  if tg_op = 'INSERT' then
    k := 'session_new'; ttl := 'New session: ' || s.title;
    bdy := public.session_when(s.date, s.start_time) || coalesce(' at ' || nullif(s.location, ''), '');
  elsif tg_op = 'UPDATE' then
    -- Only a change of day, time or place is worth a message, not edits to the plan or notes.
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
drop trigger if exists sessions_notify on public.sessions;
create trigger sessions_notify after insert or update or delete on public.sessions
  for each row execute function public.notify_session_change();

-- ---------- Announcements ----------
create or replace function public.notify_announcement() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (user_id, club_id, kind, title, body, url)
  select a.user_id, new.club_id, 'announcement', left(new.title, 200), left(new.body, 300), '/announcements'
  from (
    select m.user_id from public.memberships m where new.team_id is null and m.club_id = new.club_id
    union
    select ta.user_id from public.team_audience(new.team_id) ta where new.team_id is not null
  ) a
  where a.user_id is distinct from auth.uid();
  return null;
end $$;
drop trigger if exists announcements_notify on public.announcements;
create trigger announcements_notify after insert on public.announcements
  for each row execute function public.notify_announcement();

-- ---------- Development: shared evaluations and new goals go to the player and their parents ----------
create or replace function public.notify_development() returns trigger
language plpgsql security definer set search_path = '' as $$
declare pname text;
begin
  select split_part(full_name, ' ', 1) into pname from public.players where id = new.player_id;
  if tg_table_name = 'player_evaluations' then
    if not new.shared or (tg_op = 'UPDATE' and old.shared) then return null; end if;
    insert into public.notifications (user_id, club_id, kind, title, body, url, dedupe)
    select m.user_id, new.club_id, 'evaluation', 'New development review for ' || pname, 'From ' || new.author_name,
           '/development/' || new.player_id, 'eval:' || new.id
    from public.member_players mp join public.memberships m on m.id = mp.membership_id
    where mp.player_id = new.player_id and m.user_id is distinct from auth.uid()
    on conflict (user_id, dedupe) do nothing;
  else
    insert into public.notifications (user_id, club_id, kind, title, body, url, dedupe)
    select m.user_id, new.club_id, 'goal', 'New goal for ' || pname, left(new.title, 300),
           '/development/' || new.player_id, 'goal:' || new.id
    from public.member_players mp join public.memberships m on m.id = mp.membership_id
    where mp.player_id = new.player_id and m.user_id is distinct from auth.uid()
    on conflict (user_id, dedupe) do nothing;
  end if;
  return null;
end $$;
drop trigger if exists evaluations_notify on public.player_evaluations;
create trigger evaluations_notify after insert or update of shared on public.player_evaluations
  for each row execute function public.notify_development();
drop trigger if exists goals_notify on public.player_goals;
create trigger goals_notify after insert on public.player_goals
  for each row execute function public.notify_development();

-- ---------- Evening-before reminders for anyone who hasn't replied ----------
-- Run once a day by the app's scheduled job (server only).
create or replace function public.queue_reply_reminders() returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  insert into public.notifications (user_id, club_id, kind, title, body, url, dedupe)
  select distinct on (m.user_id, s.id, p.id)
    m.user_id, s.club_id, 'reply_reminder',
    case when m.role = 'parent' then 'Is ' || split_part(p.full_name, ' ', 1) || ' coming tomorrow?' else 'Are you coming tomorrow?' end,
    s.title || ', ' || public.session_when(s.date, s.start_time) || coalesce(' at ' || nullif(s.location, ''), ''),
    '/sessions', 'reply:' || s.id || ':' || p.id
  from public.sessions s
  join public.clubs c on c.id = s.club_id
  join public.players p on p.club_id = s.club_id and public.player_in_team(p.id, s.team_id)
  join public.member_players mp on mp.player_id = p.id
  join public.memberships m on m.id = mp.membership_id
  where s.date = (now() at time zone c.timezone)::date + 1
    and p.status = 'available'
    and not exists (select 1 from public.session_replies r where r.session_id = s.id and r.player_id = p.id)
  on conflict (user_id, dedupe) do nothing;
  get diagnostics n = row_count;
  -- Keep the inbox tidy: drop anything older than 60 days.
  delete from public.notifications where created_at < now() - interval '60 days';
  return n;
end $$;
revoke execute on function public.queue_reply_reminders() from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.queue_reply_reminders() to service_role;
  end if;
end $$;

notify pgrst, 'reload schema';
