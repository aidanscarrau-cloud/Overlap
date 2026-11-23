-- Overlap: player-by-player stats from match video. The video worker reads shirt numbers; the coach
-- confirms which squad player wore each number (Overlap suggests matches from the squad's shirt numbers).
-- Coaching staff only, like the rest of the video stats. Needs update 34. Safe to run more than once.

alter table public.match_video_jobs add column if not exists numbers jsonb not null default '{}'
  check (jsonb_typeof(numbers) = 'object');
grant update (numbers) on public.match_video_jobs to authenticated;

notify pgrst, 'reload schema';
