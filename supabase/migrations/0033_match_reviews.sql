-- Overlap: match reviews (Pro, coaching staff only). A club admin switches match review on for each team
-- separately (so the club can take that age group's rules into account). Coaches of that team can then
-- attach the match video, log quick stats and notes for each player, and get AI-drafted feedback per
-- player with drills for next training. Nothing here is visible to players or parents.
-- Safe to run more than once, including over an earlier version of this update.

-- ---------- Who counts as coaching staff ----------
create or replace function public.is_coaching_staff(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships where club_id = c and user_id = auth.uid() and role::text in ('admin', 'coach', 'assistant'))
$$;
grant execute on function public.is_coaching_staff(uuid) to authenticated;

-- ---------- Per-team switch (only club admins can change it) ----------
alter table public.teams add column if not exists match_ai boolean not null default false;

create or replace function public.keep_team_match_ai() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.match_ai is distinct from old.match_ai and auth.uid() is not null and not public.is_admin(new.club_id) then
    raise exception 'Only club admins can turn match review on or off for a team';
  end if;
  return new;
end $$;
drop trigger if exists teams_keep_match_ai on public.teams;
create trigger teams_keep_match_ai before update on public.teams for each row execute function public.keep_team_match_ai();

-- Can the signed-in person use match review for this match? Coaching staff who edit this team's matches,
-- on Pro, with match review switched on for the team.
create or replace function public.match_review_ok(mid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.matches m join public.teams t on t.id = m.team_id
    where m.id = mid and t.match_ai and public.club_is_pro(m.club_id)
      and public.is_coaching_staff(m.club_id) and public.can_do(m.team_id, 'matches.edit')
  )
$$;
grant execute on function public.match_review_ok(uuid) to authenticated;

-- ---------- Match video (staff only, so it lives outside the matches table families can read) ----------
create table if not exists public.match_videos (
  match_id uuid primary key references public.matches (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete cascade,
  url text not null check (url ~ '^https://' and char_length(url) <= 500),
  updated_at timestamptz not null default now()
);
-- (set_club_from_match checks a player; videos have none, so they use this simpler version.)
create or replace function public.set_club_from_match_only() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select m.club_id into new.club_id from public.matches m where m.id = new.match_id;
  if new.club_id is null then raise exception 'Match not found'; end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists match_videos_club on public.match_videos;
create trigger match_videos_club before insert or update on public.match_videos
  for each row execute function public.set_club_from_match_only();

-- Earlier version of this update kept the link on matches (readable by families): move it and remove it.
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'matches' and column_name = 'video_url') then
    insert into public.match_videos (match_id, club_id, url)
      select id, club_id, video_url from public.matches where video_url is not null
      on conflict (match_id) do nothing;
    alter table public.matches drop column video_url;
  end if;
end $$;
alter table public.clubs drop column if exists ai_reports;

alter table public.match_videos enable row level security;
drop policy if exists match_videos_all on public.match_videos;
create policy match_videos_all on public.match_videos for all to authenticated
  using (public.match_review_ok(match_id)) with check (public.match_review_ok(match_id));
grant select, insert, update, delete on public.match_videos to authenticated;

-- ---------- What the coach logs for each player ----------
create table if not exists public.match_reviews (
  match_id uuid not null references public.matches (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete cascade,
  rating int check (rating between 1 and 10),
  shots int not null default 0 check (shots between 0 and 50),
  on_target int not null default 0 check (on_target between 0 and 50),
  key_passes int not null default 0 check (key_passes between 0 and 50),
  tackles int not null default 0 check (tackles between 0 and 50),
  saves int not null default 0 check (saves between 0 and 50),
  notes text not null default '' check (char_length(notes) <= 2000),
  -- Moments to watch back: [{ "t": "12:30", "note": "Won the ball high and played it first time" }]
  moments jsonb not null default '[]' check (jsonb_typeof(moments) = 'array' and jsonb_array_length(moments) <= 12),
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (match_id, player_id)
);
create index if not exists match_reviews_club_idx on public.match_reviews (club_id);
drop trigger if exists match_reviews_club on public.match_reviews;
create trigger match_reviews_club before insert or update on public.match_reviews
  for each row execute function public.set_club_from_match();

create or replace function public.touch_match_review() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); new.updated_by := auth.uid(); return new; end $$;
drop trigger if exists match_reviews_touch on public.match_reviews;
create trigger match_reviews_touch before update on public.match_reviews
  for each row execute function public.touch_match_review();

alter table public.match_reviews enable row level security;
drop policy if exists match_reviews_read on public.match_reviews;
drop policy if exists match_reviews_write on public.match_reviews;
drop policy if exists match_reviews_all on public.match_reviews;
create policy match_reviews_all on public.match_reviews for all to authenticated
  using (public.match_review_ok(match_id)) with check (public.match_review_ok(match_id));
grant select, insert, update, delete on public.match_reviews to authenticated;

-- ---------- AI-drafted feedback per player (coaching staff only) ----------
create table if not exists public.match_reports (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete cascade,
  headline text not null default '' check (char_length(headline) <= 200),
  went_well jsonb not null default '[]' check (jsonb_typeof(went_well) = 'array' and jsonb_array_length(went_well) <= 6),
  work_on jsonb not null default '[]' check (jsonb_typeof(work_on) = 'array' and jsonb_array_length(work_on) <= 4),
  -- [{ "ref": "club:<uuid>" | "lib:<key>", "name": "...", "why": "..." }]
  drills jsonb not null default '[]' check (jsonb_typeof(drills) = 'array' and jsonb_array_length(drills) <= 4),
  -- [{ "area": "technical", "title": "...", "detail": "...", "added": false }]
  goal_ideas jsonb not null default '[]' check (jsonb_typeof(goal_ideas) = 'array' and jsonb_array_length(goal_ideas) <= 3),
  coach_message text not null default '' check (char_length(coach_message) <= 1000),
  moments jsonb not null default '[]' check (jsonb_typeof(moments) = 'array' and jsonb_array_length(moments) <= 12),
  ai boolean not null default false,
  author_name text not null default '',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, player_id)
);
create index if not exists match_reports_player_idx on public.match_reports (player_id);
create index if not exists match_reports_club_idx on public.match_reports (club_id);
drop trigger if exists match_reports_club on public.match_reports;
create trigger match_reports_club before insert or update on public.match_reports
  for each row execute function public.set_club_from_match();

-- Earlier version of this update shared reports with families: remove that entirely.
drop policy if exists match_reports_read on public.match_reports;
drop policy if exists match_reports_write on public.match_reports;
drop trigger if exists match_reports_notify on public.match_reports;
drop function if exists public.notify_match_report();
drop trigger if exists match_reports_prepare on public.match_reports;
drop function if exists public.prepare_match_report();
delete from public.notifications where kind = 'match_report';
alter table public.match_reports drop column if exists status;
alter table public.match_reports drop column if exists shared_at;

create or replace function public.touch_match_report() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists match_reports_touch on public.match_reports;
create trigger match_reports_touch before update on public.match_reports
  for each row execute function public.touch_match_report();

alter table public.match_reports enable row level security;
drop policy if exists match_reports_read on public.match_reports;
drop policy if exists match_reports_write on public.match_reports;
drop policy if exists match_reports_all on public.match_reports;
create policy match_reports_all on public.match_reports for all to authenticated
  using (public.match_review_ok(match_id)) with check (public.match_review_ok(match_id));
grant select, insert, update, delete on public.match_reports to authenticated;

notify pgrst, 'reload schema';
