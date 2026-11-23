-- Overlap: pitch mapping for match video stats. The panorama of the ground (for the coach to tap pitch
-- points on) and the check picture are kept in their own columns, so they're only downloaded when the
-- coach opens the pitch-mapping step. Coaching staff only, like the rest of the video stats.
-- Needs update 34. Safe to run more than once.

alter table public.match_video_jobs add column if not exists pano_jpeg text;
alter table public.match_video_jobs add column if not exists check_jpeg text;
grant select on public.match_video_jobs to authenticated;

notify pgrst, 'reload schema';
