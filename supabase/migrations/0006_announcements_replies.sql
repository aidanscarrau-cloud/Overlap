-- Overlap: announcements and training replies (are you coming?)
-- Safe to run more than once.

-- ---------- New permission switch ----------
alter table public.role_permissions drop constraint if exists role_permissions_perm_check;
alter table public.role_permissions add constraint role_permissions_perm_check check (perm in (
  'teams.view_all', 'squad.edit', 'squad.view_notes', 'sessions.edit', 'sessions.view_notes',
  'attendance.edit', 'attendance.view', 'drills.edit', 'members.view', 'invites.create',
  'announcements.post'
));
-- default_perm() already gives coaches every switch except teams.view_all, so they can post by default.

-- ---------- Announcements ----------
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  team_id uuid references public.teams (id) on delete cascade, -- null = whole club
  title text not null check (char_length(title) between 1 and 120),
  body text not null default '' check (char_length(body) <= 4000),
  pinned boolean not null default false,
  author_id uuid default auth.uid() references public.profiles (id) on delete set null,
  author_name text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists announcements_club_idx on public.announcements (club_id, created_at desc);

-- Keep the club consistent with the team, and record who posted it (players may not be able to look up names).
create or replace function public.prepare_announcement() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.team_id is not null then
    select club_id into new.club_id from public.teams where id = new.team_id;
  end if;
  if tg_op = 'INSERT' then
    new.author_id := auth.uid();
    select coalesce(nullif(full_name, ''), 'Club') into new.author_name from public.profiles where id = auth.uid();
    new.author_name := coalesce(new.author_name, 'Club');
    new.created_at := now();
  end if;
  return new;
end $$;
drop trigger if exists announcements_prepare on public.announcements;
create trigger announcements_prepare before insert or update on public.announcements
  for each row execute function public.prepare_announcement();

create or replace function public.can_post_announcement(c uuid, t uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case when t is null then public.is_admin(c) else public.can_do(t, 'announcements.post') end
$$;

alter table public.announcements enable row level security;
drop policy if exists announcements_read on public.announcements;
drop policy if exists announcements_insert on public.announcements;
drop policy if exists announcements_update on public.announcements;
drop policy if exists announcements_delete on public.announcements;
create policy announcements_read on public.announcements for select to authenticated
  using (public.is_member(club_id) and (team_id is null or public.can_view_team(team_id)));
create policy announcements_insert on public.announcements for insert to authenticated
  with check (public.can_post_announcement(club_id, team_id));
-- Authors (and admins) can pin, unpin or delete their posts.
create policy announcements_update on public.announcements for update to authenticated
  using (public.is_admin(club_id) or (author_id = auth.uid() and public.can_post_announcement(club_id, team_id)))
  with check (public.is_admin(club_id) or (author_id = auth.uid() and public.can_post_announcement(club_id, team_id)));
create policy announcements_delete on public.announcements for delete to authenticated
  using (public.is_admin(club_id) or author_id = auth.uid());
grant select, insert, update, delete on public.announcements to authenticated;

-- ---------- Training replies ----------
create table if not exists public.session_replies (
  session_id uuid not null references public.sessions (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete cascade,
  going boolean not null,
  note text not null default '' check (char_length(note) <= 120),
  replied_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (session_id, player_id)
);
create index if not exists session_replies_club_idx on public.session_replies (club_id);

alter table public.session_replies enable row level security;
-- Read: your own player's replies, or anyone on a team you can see if you may see attendance.
drop policy if exists session_replies_read on public.session_replies;
create policy session_replies_read on public.session_replies for select to authenticated
  using (public.attendance_visible(session_id, player_id));
grant select on public.session_replies to authenticated;
-- Writes only go through reply_to_session(), which checks who may reply.

create or replace function public.reply_to_session(p_session uuid, p_player uuid, p_going boolean, p_note text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare s public.sessions; p public.players;
begin
  select * into s from public.sessions where id = p_session;
  select * into p from public.players where id = p_player;
  if s.id is null or p.id is null then raise exception 'Session or player not found'; end if;
  if p.team_id <> s.team_id then raise exception 'That player is not in this session''s team'; end if;
  if s.date < (now() at time zone 'utc')::date - 1 then raise exception 'This session has already happened'; end if;
  if not (
    exists (select 1 from public.memberships where club_id = s.club_id and user_id = auth.uid() and player_id = p_player)
    or public.can_do(s.team_id, 'attendance.edit')
  ) then
    raise exception 'You can only reply for yourself or your child';
  end if;
  insert into public.session_replies (session_id, player_id, club_id, going, note, replied_by, updated_at)
  values (p_session, p_player, s.club_id, p_going, left(coalesce(p_note, ''), 120), auth.uid(), now())
  on conflict (session_id, player_id) do update
    set going = excluded.going, note = excluded.note, replied_by = excluded.replied_by, updated_at = now();
end $$;

revoke execute on function public.reply_to_session(uuid, uuid, boolean, text) from public, anon;
grant execute on function public.reply_to_session(uuid, uuid, boolean, text) to authenticated;
