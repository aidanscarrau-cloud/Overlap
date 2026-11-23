-- Overlap: AI analyst reports from match video. To write the report, short frame strips of the key moments
-- are sent to Anthropic's Claude. That's a separate, per-team switch only a club admin can turn on (off by
-- default), on top of match review. Coaching staff only, like the rest of match review. Needs update 33.
-- Safe to run more than once.

alter table public.teams add column if not exists video_ai boolean not null default false;

create or replace function public.keep_team_match_ai() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.match_ai is distinct from old.match_ai or new.video_ai is distinct from old.video_ai)
     and auth.uid() is not null and not public.is_admin(new.club_id) then
    raise exception 'Only club admins can change match review settings for a team';
  end if;
  return new;
end $$;

notify pgrst, 'reload schema';
