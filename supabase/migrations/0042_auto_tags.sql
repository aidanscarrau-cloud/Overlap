-- Overlap: auto-tagging. Once the pitch is mapped, the video worker tags shots, goals, corners, free kicks,
-- long throws, crosses, box entries and high regains itself. They're marked 'auto' until a coach confirms or
-- changes them, so they can be reviewed (and replaced if the pitch is mapped again). Needs update 38.
-- Safe to run more than once.

alter table public.match_events add column if not exists source text not null default '';
alter table public.match_events drop constraint if exists match_events_source_check;
alter table public.match_events add constraint match_events_source_check check (source in ('', 'auto'));
create index if not exists match_events_auto_idx on public.match_events (match_id) where source = 'auto';

notify pgrst, 'reload schema';
