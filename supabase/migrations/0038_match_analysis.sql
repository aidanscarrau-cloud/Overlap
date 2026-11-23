-- Overlap: match analysis (Pro, coaching staff only, on teams where a club admin has switched match review on).
-- Analysts and coaches tag events on the match video (shots, entries, turnovers, set pieces...), build clip
-- playlists, keep a set-piece library and write opposition scouting reports. Nothing here is visible to
-- players or parents. Needs update 33. Safe to run more than once.

-- ---------- Tagged events on a match video ----------
create table if not exists public.match_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete cascade,
  t real not null check (t >= 0 and t < 36000),            -- seconds into the video
  kind text not null check (char_length(kind) between 1 and 40),
  team text not null default 'us' check (team in ('us', 'them')),
  player_id uuid references public.players (id) on delete set null,
  shirt int check (shirt between 0 and 99),                 -- opposition players by number
  x real check (x between 0 and 100),                        -- where on the pitch, attacking left to right
  y real check (y between 0 and 100),
  outcome text not null default '' check (char_length(outcome) <= 40),
  routine text not null default '' check (char_length(routine) <= 60),  -- set-piece routine name
  note text not null default '' check (char_length(note) <= 500),
  pre real not null default 5 check (pre between 0 and 60),  -- clip starts this many seconds before
  post real not null default 5 check (post between 0 and 60),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists match_events_match_idx on public.match_events (match_id, t);
create index if not exists match_events_club_idx on public.match_events (club_id);

create or replace function public.set_event_club() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select m.club_id into new.club_id from public.matches m where m.id = new.match_id;
  if new.club_id is null then raise exception 'Match not found'; end if;
  -- A tagged player must belong to the same club.
  if new.player_id is not null and not exists (select 1 from public.players p where p.id = new.player_id and p.club_id = new.club_id) then
    raise exception 'Player and match must belong to the same club';
  end if;
  return new;
end $$;
drop trigger if exists match_events_club on public.match_events;
create trigger match_events_club before insert or update on public.match_events
  for each row execute function public.set_event_club();

alter table public.match_events enable row level security;
drop policy if exists match_events_all on public.match_events;
create policy match_events_all on public.match_events for all to authenticated
  using (public.match_review_ok(match_id)) with check (public.match_review_ok(match_id));
grant select, insert, update, delete on public.match_events to authenticated;

-- Coaching staff of a team, on Pro, with match review switched on (for things that belong to a team, not one match).
create or replace function public.team_analysis_ok(p_team uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.teams t
    where t.id = p_team and t.match_ai and public.club_is_pro(t.club_id)
      and public.is_coaching_staff(t.club_id) and public.can_do(t.id, 'matches.edit')
  )
$$;
grant execute on function public.team_analysis_ok(uuid) to authenticated;

create or replace function public.set_club_from_team() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select t.club_id into new.club_id from public.teams t where t.id = new.team_id;
  if new.club_id is null then raise exception 'Team not found'; end if;
  new.updated_at := now();
  return new;
end $$;

-- ---------- Clip playlists ----------
create table if not exists public.clip_playlists (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 80),
  note text not null default '' check (char_length(note) <= 1000),
  -- [{ "event_id": "<uuid>" }] in play order
  items jsonb not null default '[]' check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 200),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists clip_playlists_team_idx on public.clip_playlists (team_id);
drop trigger if exists clip_playlists_club on public.clip_playlists;
create trigger clip_playlists_club before insert or update on public.clip_playlists
  for each row execute function public.set_club_from_team();
alter table public.clip_playlists enable row level security;
drop policy if exists clip_playlists_all on public.clip_playlists;
create policy clip_playlists_all on public.clip_playlists for all to authenticated
  using (public.team_analysis_ok(team_id)) with check (public.team_analysis_ok(team_id));
grant select, insert, update, delete on public.clip_playlists to authenticated;

-- ---------- Opposition scouting reports ----------
create table if not exists public.scouting_reports (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete cascade,
  opponent text not null check (char_length(trim(opponent)) between 1 and 80),
  match_id uuid references public.matches (id) on delete set null,  -- the fixture it's for, if any
  formation text not null default '' check (char_length(formation) <= 20),
  -- { "in_possession": "...", "out_of_possession": "...", "transitions": "...", "set_pieces": "...", "how_to_beat": "..." }
  sections jsonb not null default '{}' check (jsonb_typeof(sections) = 'object'),
  -- [{ "shirt": 9, "name": "", "note": "Quick, left-footed, drifts wide" }]
  key_players jsonb not null default '[]' check (jsonb_typeof(key_players) = 'array' and jsonb_array_length(key_players) <= 20),
  -- [{ "event_id": "<uuid>" }]
  clips jsonb not null default '[]' check (jsonb_typeof(clips) = 'array' and jsonb_array_length(clips) <= 60),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists scouting_reports_team_idx on public.scouting_reports (team_id);
drop trigger if exists scouting_reports_club on public.scouting_reports;
create trigger scouting_reports_club before insert or update on public.scouting_reports
  for each row execute function public.set_club_from_team();
alter table public.scouting_reports enable row level security;
drop policy if exists scouting_reports_all on public.scouting_reports;
create policy scouting_reports_all on public.scouting_reports for all to authenticated
  using (public.team_analysis_ok(team_id)) with check (public.team_analysis_ok(team_id));
grant select, insert, update, delete on public.scouting_reports to authenticated;

notify pgrst, 'reload schema';
