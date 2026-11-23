-- Overlap: analysis tools for serious analysts (coaching staff only, like the rest of match analysis).
--  * phases with a start and an end (a press, a build-up, a counter), not just moments
--  * drawings on a paused frame (arrows, circles, zones) and a title per clip, for team presentations
--  * the match clock: when each half kicked off in the video
--  * each team's own code window (their buttons and keyboard keys)
-- Needs update 38. Safe to run more than once.

alter table public.match_events add column if not exists t_end real;
alter table public.match_events drop constraint if exists match_events_t_end_check;
alter table public.match_events add constraint match_events_t_end_check check (t_end is null or (t_end >= t and t_end < 36000));
alter table public.match_events add column if not exists title text not null default '';
alter table public.match_events drop constraint if exists match_events_title_check;
alter table public.match_events add constraint match_events_title_check check (char_length(title) <= 120);
-- { "at": 12.4, "hold": 4, "shapes": [{ "type": "arrow", "pts": [[0.1,0.2],[0.4,0.5]], "color": "#ffd400" }] }
alter table public.match_events add column if not exists drawing jsonb;
alter table public.match_events drop constraint if exists match_events_drawing_check;
alter table public.match_events add constraint match_events_drawing_check check (drawing is null or (jsonb_typeof(drawing) = 'object' and pg_column_size(drawing) < 20000));
-- The kind can now be one of the team's own codes.
alter table public.match_events drop constraint if exists match_events_kind_check;
alter table public.match_events add constraint match_events_kind_check check (char_length(kind) between 1 and 60);

-- ---------- The match clock for each video ----------
create table if not exists public.match_analysis (
  match_id uuid primary key references public.matches (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete cascade,
  -- [{ "label": "1st half", "start": 312.5, "base": 0 }, { "label": "2nd half", "start": 3410, "base": 45 }]
  periods jsonb not null default '[]' check (jsonb_typeof(periods) = 'array' and jsonb_array_length(periods) <= 6),
  updated_at timestamptz not null default now()
);
create or replace function public.set_event_club_only() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select m.club_id into new.club_id from public.matches m where m.id = new.match_id;
  if new.club_id is null then raise exception 'Match not found'; end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists match_analysis_club on public.match_analysis;
create trigger match_analysis_club before insert or update on public.match_analysis
  for each row execute function public.set_event_club_only();

alter table public.match_analysis enable row level security;
drop policy if exists match_analysis_all on public.match_analysis;
create policy match_analysis_all on public.match_analysis for all to authenticated
  using (public.match_review_ok(match_id)) with check (public.match_review_ok(match_id));
grant select, insert, update, delete on public.match_analysis to authenticated;

-- ---------- Each team's code window ----------
create table if not exists public.code_windows (
  team_id uuid primary key references public.teams (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete cascade,
  -- [{ "key": "shot", "label": "Shot", "hotkey": "s", "group": "attack", "outcomes": ["on target"], "setPiece": false, "phase": false }]
  buttons jsonb not null default '[]' check (jsonb_typeof(buttons) = 'array' and jsonb_array_length(buttons) <= 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists code_windows_club on public.code_windows;
create trigger code_windows_club before insert or update on public.code_windows
  for each row execute function public.set_club_from_team();
alter table public.code_windows enable row level security;
drop policy if exists code_windows_all on public.code_windows;
create policy code_windows_all on public.code_windows for all to authenticated
  using (public.team_analysis_ok(team_id)) with check (public.team_analysis_ok(team_id));
grant select, insert, update, delete on public.code_windows to authenticated;

notify pgrst, 'reload schema';
