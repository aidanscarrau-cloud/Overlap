-- Overlap: automatic match stats from video (Pro, coaching staff only, same per-team switch as match review).
-- A coach uploads the match video (e.g. downloaded from Veo); it goes straight to the club's video storage,
-- is analysed on a GPU worker, and is deleted once the stats are back. Only numbers are kept.
-- Needs update 33. Safe to run more than once.

create table if not exists public.match_video_jobs (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete cascade,
  status text not null default 'uploading' check (status in ('uploading', 'queued', 'processing', 'done', 'failed', 'cancelled')),
  progress real not null default 0 check (progress between 0 and 1),
  message text not null default '' check (char_length(message) <= 300),
  object_key text not null default '',
  upload_id text not null default '',
  file_name text not null default '' check (char_length(file_name) <= 200),
  file_size bigint not null default 0 check (file_size between 0 and 10737418240),
  -- Which detected team is ours (0 or 1), chosen by the coach from the two shirt colours.
  our_team int check (our_team in (0, 1)),
  results jsonb,
  video_deleted boolean not null default false,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists match_video_jobs_match_idx on public.match_video_jobs (match_id, created_at desc);
create index if not exists match_video_jobs_club_idx on public.match_video_jobs (club_id);

create or replace function public.prepare_match_video_job() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select m.club_id into new.club_id from public.matches m where m.id = new.match_id;
  if new.club_id is null then raise exception 'Match not found'; end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists match_video_jobs_prepare on public.match_video_jobs;
create trigger match_video_jobs_prepare before insert or update on public.match_video_jobs
  for each row execute function public.prepare_match_video_job();

-- Coaches can read their team's jobs and pick which colour is their team. Everything else (status,
-- progress, results, storage keys) is written by the server, which uses its own key and skips these rules.
alter table public.match_video_jobs enable row level security;
drop policy if exists match_video_jobs_read on public.match_video_jobs;
drop policy if exists match_video_jobs_update on public.match_video_jobs;
create policy match_video_jobs_read on public.match_video_jobs for select to authenticated using (public.match_review_ok(match_id));
create policy match_video_jobs_update on public.match_video_jobs for update to authenticated
  using (public.match_review_ok(match_id)) with check (public.match_review_ok(match_id));
revoke all on public.match_video_jobs from authenticated;
grant select on public.match_video_jobs to authenticated;
grant update (our_team) on public.match_video_jobs to authenticated;

notify pgrst, 'reload schema';
