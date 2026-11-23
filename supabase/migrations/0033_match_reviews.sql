-- Overlap: match reviews (Pro). Coaches attach the match video (e.g. a Veo link), log quick stats and
-- notes for each player, and get a personal feedback report per player, written with AI and always
-- checked by the coach before the family sees it. Stats and coach notes are staff-only; families only
-- see a report once the coach shares it. Safe to run more than once.

-- ---------- Match video ----------
alter table public.matches add column if not exists video_url text;
alter table public.matches drop constraint if exists matches_video_url_check;
alter table public.matches add constraint matches_video_url_check
  check (video_url is null or (video_url ~ '^https://' and char_length(video_url) <= 500));

-- ---------- Club setting: AI feedback is off until an admin turns it on ----------
alter table public.clubs add column if not exists ai_reports boolean not null default false;

-- ---------- Notifications for shared reports ----------
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'session_new', 'session_changed', 'session_cancelled', 'announcement', 'reply_reminder', 'evaluation', 'goal',
  'match_new', 'match_changed', 'match_cancelled', 'squad', 'result', 'self_review', 'self_review_done', 'message',
  'injury', 'trial', 'match_report'
));

-- ---------- What the coach logs for each player (staff only) ----------
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
create policy match_reviews_read on public.match_reviews for select to authenticated using (public.match_editable(match_id));
create policy match_reviews_write on public.match_reviews for all to authenticated
  using (public.match_editable(match_id) and public.club_is_pro(club_id))
  with check (public.match_editable(match_id) and public.club_is_pro(club_id));
grant select, insert, update, delete on public.match_reviews to authenticated;

-- ---------- The player's report (families see it once shared) ----------
create table if not exists public.match_reports (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'shared')),
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
  shared_at timestamptz,
  unique (match_id, player_id)
);
create index if not exists match_reports_player_idx on public.match_reports (player_id);
create index if not exists match_reports_club_idx on public.match_reports (club_id);
drop trigger if exists match_reports_club on public.match_reports;
create trigger match_reports_club before insert or update on public.match_reports
  for each row execute function public.set_club_from_match();

create or replace function public.prepare_match_report() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if new.status = 'shared' and (tg_op = 'INSERT' or old.status <> 'shared') then new.shared_at := now(); end if;
  if new.status = 'draft' then new.shared_at := null; end if;
  return new;
end $$;
drop trigger if exists match_reports_prepare on public.match_reports;
create trigger match_reports_prepare before insert or update on public.match_reports
  for each row execute function public.prepare_match_report();

-- Tell the player's family when a report is shared.
create or replace function public.notify_match_report() returns trigger
language plpgsql security definer set search_path = '' as $$
declare pname text; opp text;
begin
  if new.status <> 'shared' or (tg_op = 'UPDATE' and old.status = 'shared') then return null; end if;
  select split_part(full_name, ' ', 1) into pname from public.players where id = new.player_id;
  select opponent into opp from public.matches where id = new.match_id;
  insert into public.notifications (user_id, club_id, kind, title, body, url, dedupe)
  select m.user_id, new.club_id, 'match_report', 'Match feedback for ' || pname, left('From the game vs ' || coalesce(opp, 'your last opponent') || '. ' || new.headline, 300),
         '/matches?m=' || new.match_id, 'mreport:' || new.id
  from public.member_players mp join public.memberships m on m.id = mp.membership_id
  where mp.player_id = new.player_id and m.user_id is distinct from auth.uid()
  on conflict (user_id, dedupe) do update set title = excluded.title, body = excluded.body, created_at = now(), read_at = null, pushed_at = null;
  return null;
end $$;
drop trigger if exists match_reports_notify on public.match_reports;
create trigger match_reports_notify after insert or update of status on public.match_reports
  for each row execute function public.notify_match_report();

alter table public.match_reports enable row level security;
drop policy if exists match_reports_read on public.match_reports;
drop policy if exists match_reports_write on public.match_reports;
create policy match_reports_read on public.match_reports for select to authenticated using (
  public.match_editable(match_id) or (status = 'shared' and public.is_linked_player(player_id))
);
create policy match_reports_write on public.match_reports for all to authenticated
  using (public.match_editable(match_id) and public.club_is_pro(club_id))
  with check (public.match_editable(match_id) and public.club_is_pro(club_id));
grant select, insert, update, delete on public.match_reports to authenticated;

notify pgrst, 'reload schema';
