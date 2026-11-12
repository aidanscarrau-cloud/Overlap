-- Overlap: matches, squads, line-ups, results and player stats.
-- * Matches belong to a team. Coaches with "Manage matches" create them, pick the squad and line-up,
--   and enter the result and each player's minutes, goals, assists and cards.
-- * Players and parents say whether they're available (like training replies) and see the squad
--   once it's announced.
-- * A whole draw can be imported in one go (one summary notification); importing again updates it.
-- Safe to run more than once.

-- ---------- Permission switch ----------
alter table public.role_permissions drop constraint if exists role_permissions_perm_check;
alter table public.role_permissions add constraint role_permissions_perm_check check (perm in (
  'teams.view_all', 'squad.edit', 'squad.view_notes', 'sessions.edit', 'sessions.view_notes',
  'attendance.edit', 'attendance.view', 'drills.edit', 'members.view', 'invites.create',
  'announcements.post', 'idp.view', 'idp.edit', 'matches.edit'
));
-- default_perm() already gives head coaches every switch but "see all teams", so they can manage
-- matches; assistant coaches can't until an admin switches it on.

-- ---------- Notification kinds ----------
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'session_new', 'session_changed', 'session_cancelled', 'announcement', 'reply_reminder', 'evaluation', 'goal',
  'match_new', 'match_changed', 'match_cancelled', 'squad', 'result'
));

-- ---------- Matches ----------
create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  date date not null,
  kickoff time not null default '09:00',
  meet_time time,
  opponent text not null check (char_length(trim(opponent)) between 1 and 80),
  home_away text not null default 'home' check (home_away in ('home', 'away', 'neutral')),
  venue text not null default '' check (char_length(venue) <= 120),
  competition text not null default '' check (char_length(competition) <= 60),
  round text not null default '' check (char_length(round) <= 30),
  format text not null default '11' check (format in ('5', '7', '9', '11')),
  length_mins int not null default 60 check (length_mins between 10 and 150),
  status text not null default 'scheduled' check (status in ('scheduled', 'postponed', 'cancelled', 'played')),
  our_score int check (our_score between 0 and 99),
  their_score int check (their_score between 0 and 99),
  formation text not null default '' check (char_length(formation) <= 20),
  squad_published boolean not null default false,
  report text not null default '' check (char_length(report) <= 3000),
  external_ref text check (char_length(external_ref) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists matches_team_idx on public.matches (team_id, date);
create index if not exists matches_club_idx on public.matches (club_id, date);
create unique index if not exists matches_external_ref_idx on public.matches (team_id, external_ref) where external_ref is not null;

drop trigger if exists matches_club on public.matches;
create trigger matches_club before insert or update on public.matches
  for each row execute function public.set_club_from_team();

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists matches_touch on public.matches;
create trigger matches_touch before update on public.matches
  for each row execute function public.touch_updated_at();

alter table public.matches enable row level security;
drop policy if exists matches_read on public.matches;
drop policy if exists matches_insert on public.matches;
drop policy if exists matches_update on public.matches;
drop policy if exists matches_delete on public.matches;
create policy matches_read on public.matches for select to authenticated using (public.can_view_team(team_id));
create policy matches_insert on public.matches for insert to authenticated with check (public.can_do(team_id, 'matches.edit'));
create policy matches_update on public.matches for update to authenticated
  using (public.can_do(team_id, 'matches.edit')) with check (public.can_do(team_id, 'matches.edit'));
create policy matches_delete on public.matches for delete to authenticated using (public.can_do(team_id, 'matches.edit'));
grant select, insert, update, delete on public.matches to authenticated;

create or replace function public.match_editable(mid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.matches m where m.id = mid and public.can_do(m.team_id, 'matches.edit'))
$$;

-- ---------- Squad, line-up and stats (one row per player in the squad) ----------
create table if not exists public.match_players (
  match_id uuid not null references public.matches (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete cascade,
  role text not null default 'bench' check (role in ('start', 'bench')),
  slot int check (slot between 0 and 10),
  minutes int check (minutes between 0 and 150),
  goals int not null default 0 check (goals between 0 and 20),
  assists int not null default 0 check (assists between 0 and 20),
  yellow int not null default 0 check (yellow between 0 and 2),
  red int not null default 0 check (red between 0 and 1),
  primary key (match_id, player_id)
);
create index if not exists match_players_player_idx on public.match_players (player_id);
create index if not exists match_players_club_idx on public.match_players (club_id);

-- Rows take their club from the match; the player must be in the same club (they may play up a team).
create or replace function public.set_club_from_match() returns trigger
language plpgsql security definer set search_path = '' as $$
declare p_club uuid;
begin
  select m.club_id into new.club_id from public.matches m where m.id = new.match_id;
  select p.club_id into p_club from public.players p where p.id = new.player_id;
  if new.club_id is null or p_club is distinct from new.club_id then
    raise exception 'Player and match must belong to the same club';
  end if;
  return new;
end $$;
drop trigger if exists match_players_club on public.match_players;
create trigger match_players_club before insert or update on public.match_players
  for each row execute function public.set_club_from_match();

alter table public.match_players enable row level security;
drop policy if exists match_players_read on public.match_players;
drop policy if exists match_players_write on public.match_players;
-- Families see the squad once it's announced (or the match has been played); staff of the team always.
create policy match_players_read on public.match_players for select to authenticated using (
  exists (
    select 1 from public.matches m where m.id = match_id and public.can_view_team(m.team_id)
      and (m.squad_published or m.status = 'played' or public.can_do(m.team_id, 'matches.edit')
           or (public.can_manage_team(m.team_id) and public.has_perm(m.club_id, 'attendance.view')))
  ) or (public.is_linked_player(player_id) and exists (
    select 1 from public.matches m where m.id = match_id and (m.squad_published or m.status = 'played')
  ))
);
create policy match_players_write on public.match_players for all to authenticated
  using (public.match_editable(match_id)) with check (public.match_editable(match_id));
grant select, insert, update, delete on public.match_players to authenticated;

-- ---------- Availability replies ----------
create table if not exists public.match_replies (
  match_id uuid not null references public.matches (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete cascade,
  going boolean not null,
  note text not null default '' check (char_length(note) <= 120),
  replied_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (match_id, player_id)
);
create index if not exists match_replies_club_idx on public.match_replies (club_id);
alter table public.match_replies enable row level security;
drop policy if exists match_replies_read on public.match_replies;
create policy match_replies_read on public.match_replies for select to authenticated using (
  public.is_linked_player(player_id) or exists (
    select 1 from public.matches m where m.id = match_id and public.can_view_team(m.team_id) and public.has_perm(m.club_id, 'attendance.view')
  )
);
grant select on public.match_replies to authenticated;
-- Writes only go through reply_to_match(), which checks who may reply.

create or replace function public.reply_to_match(p_match uuid, p_player uuid, p_going boolean, p_note text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare m public.matches;
begin
  select * into m from public.matches where id = p_match;
  if m.id is null or not exists (select 1 from public.players where id = p_player) then raise exception 'Match or player not found'; end if;
  if not public.player_in_team(p_player, m.team_id) then raise exception 'That player is not in this match''s team'; end if;
  if m.date < (now() at time zone 'utc')::date - 1 then raise exception 'This match has already happened'; end if;
  if not (public.is_linked_player(p_player) or public.can_do(m.team_id, 'attendance.edit') or public.can_do(m.team_id, 'matches.edit')) then
    raise exception 'You can only reply for yourself or your children';
  end if;
  insert into public.match_replies (match_id, player_id, club_id, going, note, replied_by, updated_at)
  values (p_match, p_player, m.club_id, p_going, left(coalesce(p_note, ''), 120), auth.uid(), now())
  on conflict (match_id, player_id) do update
    set going = excluded.going, note = excluded.note, replied_by = excluded.replied_by, updated_at = now();
end $$;
revoke execute on function public.reply_to_match(uuid, uuid, boolean, text) from public, anon;
grant execute on function public.reply_to_match(uuid, uuid, boolean, text) to authenticated;

-- ---------- Notifications ----------
create or replace function public.match_label(m public.matches) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select name from public.teams where id = m.team_id), 'Your team') || ' vs ' || m.opponent
$$;

create or replace function public.notify_match_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare m public.matches; k text; ttl text; bdy text; url text;
begin
  if coalesce(current_setting('overlap.bulk', true), '') = 'on' then return null; end if;
  if tg_op = 'DELETE' then m := old; else m := new; end if;
  url := '/matches?m=' || m.id;
  if tg_op = 'INSERT' then
    if m.date < current_date or m.status <> 'scheduled' then return null; end if;
    k := 'match_new'; ttl := 'New match: ' || public.match_label(m);
    bdy := public.session_when(m.date, m.kickoff) || coalesce(' at ' || nullif(m.venue, ''), '') || ' (' || m.home_away || ')';
  elsif tg_op = 'DELETE' then
    if m.date < current_date or m.status in ('played', 'cancelled') then return null; end if;
    k := 'match_cancelled'; ttl := 'Match cancelled: ' || public.match_label(m);
    bdy := 'It was ' || public.session_when(m.date, m.kickoff); url := '/matches';
  elsif new.status = 'played' and old.status <> 'played' and new.our_score is not null and new.their_score is not null then
    k := 'result';
    ttl := 'Result: ' || public.match_label(m) || ' ' || new.our_score || '–' || new.their_score;
    bdy := case when new.our_score > new.their_score then 'A win!' when new.our_score = new.their_score then 'A draw.' else 'A loss this time.' end
      || case when new.report <> '' then ' ' || left(new.report, 200) else '' end;
  elsif new.status in ('cancelled', 'postponed') and old.status is distinct from new.status then
    if new.date < current_date then return null; end if;
    k := 'match_cancelled'; ttl := 'Match ' || new.status || ': ' || public.match_label(m);
    bdy := 'It was ' || public.session_when(m.date, m.kickoff);
  elsif new.squad_published and not old.squad_published and new.date >= current_date then
    k := 'squad'; ttl := 'Squad announced: ' || public.match_label(m);
    bdy := public.session_when(m.date, m.kickoff) || coalesce(' at ' || nullif(m.venue, ''), '') || '. See who''s playing.';
  elsif new.date >= current_date and new.status = 'scheduled'
        and (new.date <> old.date or new.kickoff <> old.kickoff or new.venue <> old.venue or old.status <> 'scheduled') then
    k := 'match_changed'; ttl := 'Match changed: ' || public.match_label(m);
    bdy := 'Now ' || public.session_when(m.date, m.kickoff) || coalesce(' at ' || nullif(m.venue, ''), '');
  else
    return null;
  end if;
  insert into public.notifications (user_id, club_id, kind, title, body, url)
  select a.user_id, m.club_id, k, left(ttl, 200), left(bdy, 300), url
  from public.team_audience(m.team_id) a
  where a.user_id is distinct from auth.uid();
  return null;
end $$;
drop trigger if exists matches_notify on public.matches;
create trigger matches_notify after insert or update or delete on public.matches
  for each row execute function public.notify_match_change();

-- ---------- Import a draw: add or update many matches at once ----------
-- p_rows: [{"ref": "...", "date": "2027-04-05", "kickoff": "09:00", "opponent": "...", "home_away": "home",
--           "venue": "...", "competition": "...", "round": "..."}]
-- Rows with a ref that's already there are updated (date, time, venue, opponent); others are added.
create or replace function public.import_matches(p_team uuid, p_rows jsonb, p_format text default '11', p_length int default 60)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb; added int := 0; changed int := 0; c uuid; ex public.matches; d date; first_d date; last_d date; cnt int;
begin
  if not public.can_do(p_team, 'matches.edit') then raise exception 'You can''t manage matches for this team.'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'Nothing to import.'; end if;
  if jsonb_array_length(p_rows) > 80 then raise exception 'Import at most 80 matches at a time.'; end if;
  select club_id into c from public.teams where id = p_team;
  perform set_config('overlap.bulk', 'on', true);
  for r in select * from jsonb_array_elements(p_rows) loop
    d := (r ->> 'date')::date;
    if d is null or nullif(trim(r ->> 'opponent'), '') is null then raise exception 'Every match needs a date and an opponent.'; end if;
    if d < current_date - 366 or d > current_date + 731 then raise exception 'Dates must be within two years.'; end if;
    select * into ex from public.matches where team_id = p_team and external_ref = left(r ->> 'ref', 200);
    if ex.id is not null then
      update public.matches set date = d, kickoff = coalesce(nullif(r ->> 'kickoff', '')::time, kickoff),
        opponent = left(trim(r ->> 'opponent'), 80), home_away = coalesce(nullif(r ->> 'home_away', ''), home_away),
        venue = left(coalesce(r ->> 'venue', venue), 120), competition = left(coalesce(nullif(r ->> 'competition', ''), competition), 60),
        round = left(coalesce(nullif(r ->> 'round', ''), round), 30)
      where id = ex.id
        and (date, kickoff, opponent, home_away, venue) is distinct from
            (d, coalesce(nullif(r ->> 'kickoff', '')::time, kickoff), left(trim(r ->> 'opponent'), 80), coalesce(nullif(r ->> 'home_away', ''), home_away), left(coalesce(r ->> 'venue', venue), 120));
      if found then changed := changed + 1; end if;
    else
      insert into public.matches (club_id, team_id, date, kickoff, opponent, home_away, venue, competition, round, format, length_mins, external_ref)
      values (c, p_team, d, coalesce(nullif(r ->> 'kickoff', '')::time, '09:00'), left(trim(r ->> 'opponent'), 80),
        coalesce(nullif(r ->> 'home_away', ''), 'home'), left(coalesce(r ->> 'venue', ''), 120), left(coalesce(r ->> 'competition', ''), 60),
        left(coalesce(r ->> 'round', ''), 30), coalesce(nullif(p_format, ''), '11'), coalesce(p_length, 60), nullif(left(r ->> 'ref', 200), ''));
      added := added + 1;
    end if;
    ex := null;
  end loop;
  perform set_config('overlap.bulk', 'off', true);

  select count(*), min(x.date), max(x.date) into cnt, first_d, last_d
  from (select (e ->> 'date')::date as date from jsonb_array_elements(p_rows) e) x where x.date >= current_date;
  if cnt > 0 and (added > 0 or changed > 0) then
    perform public.notify_series(p_team, c, 'match_new',
      case when added > 0 then 'Draw added: ' else 'Draw updated: ' end || coalesce((select name from public.teams where id = p_team), 'your team'),
      case when added > 0
        then cnt || case when cnt = 1 then ' match' else ' matches' end || ' from ' || trim(to_char(first_d, 'FMDD Mon')) || ' to ' || trim(to_char(last_d, 'FMDD Mon')) || '. Check the dates and say if you can play.'
        else changed || case when changed = 1 then ' match has' else ' matches have' end || ' a new date, time or place. Check the draw.' end);
  end if;
  return jsonb_build_object('added', added, 'changed', changed);
end $$;
revoke execute on function public.import_matches(uuid, jsonb, text, int) from public, anon;
grant execute on function public.import_matches(uuid, jsonb, text, int) to authenticated;

-- ---------- Evening-before reminders now cover matches too ----------
create or replace function public.queue_reply_reminders() returns int
language plpgsql security definer set search_path = '' as $$
declare n int; n2 int;
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

  insert into public.notifications (user_id, club_id, kind, title, body, url, dedupe)
  select distinct on (m.user_id, x.id, p.id)
    m.user_id, x.club_id, 'reply_reminder',
    case when m.role = 'parent' then 'Can ' || split_part(p.full_name, ' ', 1) || ' play tomorrow?' else 'Can you play tomorrow?' end,
    public.match_label(x) || ', ' || public.session_when(x.date, x.kickoff) || coalesce(' at ' || nullif(x.venue, ''), ''),
    '/matches?m=' || x.id, 'mreply:' || x.id || ':' || p.id
  from public.matches x
  join public.clubs c on c.id = x.club_id
  join public.players p on p.club_id = x.club_id and public.player_in_team(p.id, x.team_id)
  join public.member_players mp on mp.player_id = p.id
  join public.memberships m on m.id = mp.membership_id
  where x.date = (now() at time zone c.timezone)::date + 1
    and x.status = 'scheduled'
    and p.status = 'available'
    and not exists (select 1 from public.match_replies r where r.match_id = x.id and r.player_id = p.id)
  on conflict (user_id, dedupe) do nothing;
  get diagnostics n2 = row_count;

  delete from public.notifications where created_at < now() - interval '60 days';
  return n + n2;
end $$;
revoke execute on function public.queue_reply_reminders() from public, anon, authenticated;

-- ---------- Phone calendars show matches too ----------
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
    (s.date + s.start_time) at time zone c.timezone, greatest(public.session_minutes(s.plan), 0), s.created_at
  from public.sessions s
  join teams_of x on x.id = s.team_id
  join public.teams t on t.id = s.team_id
  join public.clubs c on c.id = s.club_id
  where s.date between current_date - 60 and current_date + 400
  union all
  select g.id, c.name, t.name,
    case when g.status = 'postponed' then 'POSTPONED: ' else '' end || 'Match vs ' || g.opponent || ' (' || g.home_away || ')',
    g.venue,
    concat_ws(' · ', nullif(g.competition, ''), nullif(g.round, ''), case when g.meet_time is not null then 'Arrive by ' || to_char(g.meet_time, 'HH24:MI') end),
    (g.date + g.kickoff) at time zone c.timezone, g.length_mins + 15, g.updated_at
  from public.matches g
  join teams_of x on x.id = g.team_id
  join public.teams t on t.id = g.team_id
  join public.clubs c on c.id = g.club_id
  where g.status <> 'cancelled' and g.date between current_date - 60 and current_date + 400
  order by 7
$$;
revoke execute on function public.calendar_feed(text) from public, authenticated;
grant execute on function public.calendar_feed(text) to anon;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.calendar_feed(text) to service_role;
  end if;
end $$;

notify pgrst, 'reload schema';
