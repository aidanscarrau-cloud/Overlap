-- Overlap: player self-reviews.
-- A coach asks a player (or a whole team) to rate themselves in the five development areas and say
-- what's going well, what they want to improve and a goal. The player (or their parent) fills it in,
-- the coach is told, and can reply. Safe to run more than once.

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'session_new', 'session_changed', 'session_cancelled', 'announcement', 'reply_reminder', 'evaluation', 'goal',
  'match_new', 'match_changed', 'match_cancelled', 'squad', 'result', 'self_review', 'self_review_done'
));

create table if not exists public.self_reviews (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  -- the request
  author_id uuid references public.profiles (id) on delete set null,
  author_name text not null default '',
  message text not null default '' check (char_length(message) <= 500),
  due_date date,
  created_at timestamptz not null default now(),
  -- the player's answers
  ratings jsonb not null default '{}' check (public.valid_ratings(ratings)),
  going_well text not null default '' check (char_length(going_well) <= 1000),
  improve text not null default '' check (char_length(improve) <= 1000),
  goal_idea text not null default '' check (char_length(goal_idea) <= 500),
  submitted_at timestamptz,
  submitted_by uuid references public.profiles (id) on delete set null,
  submitted_by_name text not null default '',
  -- the coach's reply
  coach_reply text not null default '' check (char_length(coach_reply) <= 1000),
  replied_at timestamptz
);
create index if not exists self_reviews_player_idx on public.self_reviews (player_id, created_at desc);
create index if not exists self_reviews_club_idx on public.self_reviews (club_id);

drop trigger if exists self_reviews_club on public.self_reviews;
create trigger self_reviews_club before insert on public.self_reviews
  for each row execute function public.set_club_from_player();
drop trigger if exists self_reviews_author on public.self_reviews;
create trigger self_reviews_author before insert or update on public.self_reviews
  for each row execute function public.stamp_author();

alter table public.self_reviews enable row level security;
drop policy if exists self_reviews_read on public.self_reviews;
drop policy if exists self_reviews_insert on public.self_reviews;
drop policy if exists self_reviews_update on public.self_reviews;
drop policy if exists self_reviews_delete on public.self_reviews;
-- Staff who can see development plans, and the player and their parents.
create policy self_reviews_read on public.self_reviews for select to authenticated
  using (public.sees_idp(player_id) or public.is_linked_player(player_id));
create policy self_reviews_insert on public.self_reviews for insert to authenticated
  with check (public.can_do_player(player_id, 'idp.edit'));
-- Coaches can change the request and reply; players answer through submit_self_review().
create policy self_reviews_update on public.self_reviews for update to authenticated
  using (public.can_do_player(player_id, 'idp.edit')) with check (public.can_do_player(player_id, 'idp.edit'));
create policy self_reviews_delete on public.self_reviews for delete to authenticated
  using (public.can_do_player(player_id, 'idp.edit'));
revoke insert, update on public.self_reviews from anon, authenticated;
grant select, delete on public.self_reviews to authenticated;
grant insert (player_id, message, due_date) on public.self_reviews to authenticated;
grant update (message, due_date, coach_reply, replied_at) on public.self_reviews to authenticated;

-- The player (or a parent) sends their answers. Can be changed until the coach replies.
create or replace function public.submit_self_review(p_id uuid, p_ratings jsonb, p_going_well text, p_improve text, p_goal text)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.self_reviews; me text;
begin
  select * into r from public.self_reviews where id = p_id;
  if r.id is null then raise exception 'Self-review not found'; end if;
  if not public.is_linked_player(r.player_id) then raise exception 'Only the player or their parent can fill this in.'; end if;
  if r.coach_reply <> '' then raise exception 'Your coach has already replied, so this can''t be changed.'; end if;
  if not public.valid_ratings(coalesce(p_ratings, '{}'::jsonb)) then raise exception 'Ratings must be from 1 to 10.'; end if;
  if (select count(*) from jsonb_object_keys(coalesce(p_ratings, '{}'::jsonb))) < 5 then raise exception 'Give yourself a rating in all five areas.'; end if;
  select coalesce(nullif(full_name, ''), 'Player') into me from public.profiles where id = auth.uid();
  update public.self_reviews set ratings = p_ratings, going_well = left(coalesce(p_going_well, ''), 1000), improve = left(coalesce(p_improve, ''), 1000),
    goal_idea = left(coalesce(p_goal, ''), 500), submitted_at = now(), submitted_by = auth.uid(), submitted_by_name = coalesce(me, 'Player')
  where id = p_id;
end $$;
revoke execute on function public.submit_self_review(uuid, jsonb, text, text, text) from public, anon;
grant execute on function public.submit_self_review(uuid, jsonb, text, text, text) to authenticated;

-- Notifications: the request goes to the player and their parents; the answers go to the coach who asked;
-- a coach reply goes back to the family.
create or replace function public.notify_self_review() returns trigger
language plpgsql security definer set search_path = '' as $$
declare pname text;
begin
  select split_part(full_name, ' ', 1) into pname from public.players where id = new.player_id;
  if tg_op = 'INSERT' then
    insert into public.notifications (user_id, club_id, kind, title, body, url, dedupe)
    select m.user_id, new.club_id, 'self_review',
      case when m.role = 'parent' then 'Self-review for ' || pname else 'Your coach wants your self-review' end,
      coalesce(nullif(new.message, ''), 'Rate yourself in five areas and say what''s going well. It takes about 5 minutes.')
        || case when new.due_date is not null then ' (by ' || trim(to_char(new.due_date, 'FMDD Mon')) || ')' else '' end,
      '/development/' || new.player_id || '?self=' || new.id, 'self:' || new.id
    from public.member_players mp join public.memberships m on m.id = mp.membership_id
    where mp.player_id = new.player_id and m.user_id is distinct from auth.uid()
    on conflict (user_id, dedupe) do nothing;
  elsif new.submitted_at is not null and old.submitted_at is null and new.author_id is not null then
    insert into public.notifications (user_id, club_id, kind, title, body, url, dedupe)
    values (new.author_id, new.club_id, 'self_review_done', pname || ' sent their self-review',
      'See how they rated themselves next to your evaluation.', '/development/' || new.player_id || '?self=' || new.id, 'selfdone:' || new.id)
    on conflict (user_id, dedupe) do nothing;
  elsif new.coach_reply <> '' and old.coach_reply = '' then
    insert into public.notifications (user_id, club_id, kind, title, body, url, dedupe)
    select m.user_id, new.club_id, 'self_review_done', 'Your coach replied to ' || case when m.role = 'parent' then pname || '''s' else 'your' end || ' self-review',
      left(new.coach_reply, 300), '/development/' || new.player_id || '?self=' || new.id, 'selfreply:' || new.id
    from public.member_players mp join public.memberships m on m.id = mp.membership_id
    where mp.player_id = new.player_id and m.user_id is distinct from auth.uid()
    on conflict (user_id, dedupe) do nothing;
  end if;
  return null;
end $$;
drop trigger if exists self_reviews_notify on public.self_reviews;
create trigger self_reviews_notify after insert or update on public.self_reviews
  for each row execute function public.notify_self_review();

notify pgrst, 'reload schema';
