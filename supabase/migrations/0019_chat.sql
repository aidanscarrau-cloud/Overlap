-- Overlap: team chat, staff chat and direct messages, designed for junior football safeguarding:
-- * Every team has a team chat (coaches, players and parents of that team). Club admins can read all of them.
-- * Every club has a staff chat (admins, head coaches, assistant coaches).
-- * Direct messages are between adults only (admins, coaches and parents). Players can't send or receive them,
--   so no adult can message a child privately.
-- * Coaches can make a team chat "coaches only post", and can remove messages.
-- * Player accounts under the club's chat age (14 by default) can't use chat at all; their parents are in
--   the team chat instead. A player's age comes from their birth year if set, otherwise from their team's
--   age group (anyone in a U14-or-younger team counts as under 14). Direct messages are never open to players.
-- Safe to run more than once.

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'session_new', 'session_changed', 'session_cancelled', 'announcement', 'reply_reminder', 'evaluation', 'goal',
  'match_new', 'match_changed', 'match_cancelled', 'squad', 'result', 'self_review', 'self_review_done', 'message'
));
alter table public.notification_prefs add column if not exists messages boolean not null default true;

-- ---------- Tables ----------
create table if not exists public.chat_channels (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  kind text not null check (kind in ('team', 'staff', 'direct')),
  team_id uuid references public.teams (id) on delete cascade,
  posting text not null default 'all' check (posting in ('all', 'staff')),
  created_at timestamptz not null default now(),
  check ((kind = 'team') = (team_id is not null))
);
create unique index if not exists chat_channels_team_idx on public.chat_channels (team_id) where kind = 'team';
create unique index if not exists chat_channels_staff_idx on public.chat_channels (club_id) where kind = 'staff';

create table if not exists public.chat_direct_members (
  channel_id uuid not null references public.chat_channels (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (channel_id, user_id)
);
create index if not exists chat_direct_members_user_idx on public.chat_direct_members (user_id);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.chat_channels (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null default auth.uid(),
  author_name text not null default '',
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by_name text
);
create index if not exists chat_messages_channel_idx on public.chat_messages (channel_id, created_at desc);

create table if not exists public.chat_reads (
  channel_id uuid not null references public.chat_channels (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  muted boolean not null default false,
  primary key (channel_id, user_id)
);

-- ---------- Age limit for player accounts ----------
alter table public.players add column if not exists birth_year int check (birth_year between 1900 and 2100);
grant select (birth_year) on public.players to authenticated;
alter table public.clubs add column if not exists chat_min_age int not null default 14 check (chat_min_age between 0 and 21);
alter table public.clubs alter column chat_min_age set default 14;

-- Is this player old enough for chat? Birth year first; otherwise no team of theirs may be U<age> or younger.
create or replace function public.chat_age_ok(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case
      when p.birth_year is not null then extract(year from current_date)::int - p.birth_year >= c.chat_min_age
      else not exists (
        select 1 from public.teams t
        where (t.id = p.team_id or t.id in (select pt.team_id from public.player_teams pt where pt.player_id = p.id))
          and coalesce(substring(lower(coalesce(t.age_group, '') || ' ' || t.name) from '(?:^|[^a-z])(?:u|under)[ -]*([0-9]{1,2})(?:[^0-9]|$)')::int, 99) <= c.chat_min_age
      )
    end
    from public.players p join public.clubs c on c.id = p.club_id where p.id = pid
  ), false)
$$;

-- May this member use chat? Everyone except player accounts that are under the age (or not linked to a player yet).
create or replace function public.chat_allowed_for(p_club uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m where m.club_id = p_club and m.user_id = p_user and (
      m.role::text <> 'player'
      or exists (select 1 from public.member_players mp where mp.membership_id = m.id and public.chat_age_ok(mp.player_id))
    )
  )
$$;
create or replace function public.chat_allowed(p_club uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.chat_allowed_for(p_club, auth.uid())
$$;
grant execute on function public.chat_allowed(uuid) to authenticated;

-- ---------- Who can read and post ----------
create or replace function public.chat_can_read(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.chat_channels c where c.id = cid and public.chat_allowed(c.club_id) and (
      (c.kind = 'team' and public.can_view_team(c.team_id))
      or (c.kind = 'staff' and public.is_staff(c.club_id))
      or (c.kind = 'direct' and exists (select 1 from public.chat_direct_members d where d.channel_id = c.id and d.user_id = auth.uid()))
    )
  )
$$;

create or replace function public.chat_is_moderator(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.chat_channels c where c.id = cid and (
      public.is_admin(c.club_id)
      or (c.kind = 'team' and public.is_staff(c.club_id) and public.can_manage_team(c.team_id))
      or (c.kind = 'staff' and public.is_staff(c.club_id))
    )
  )
$$;

create or replace function public.chat_can_post(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.chat_can_read(cid) and exists (
    select 1 from public.chat_channels c where c.id = cid and (c.posting = 'all' or public.chat_is_moderator(cid))
  )
$$;

alter table public.chat_channels enable row level security;
alter table public.chat_direct_members enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_reads enable row level security;

drop policy if exists chat_channels_read on public.chat_channels;
drop policy if exists chat_channels_update on public.chat_channels;
create policy chat_channels_read on public.chat_channels for select to authenticated using (public.chat_can_read(id));
create policy chat_channels_update on public.chat_channels for update to authenticated
  using (kind = 'team' and public.chat_is_moderator(id)) with check (kind = 'team' and public.chat_is_moderator(id));
revoke insert, update, delete on public.chat_channels from anon, authenticated;
grant select on public.chat_channels to authenticated;
grant update (posting) on public.chat_channels to authenticated;

drop policy if exists chat_direct_members_read on public.chat_direct_members;
create policy chat_direct_members_read on public.chat_direct_members for select to authenticated using (public.chat_can_read(channel_id));
revoke insert, update, delete on public.chat_direct_members from anon, authenticated;
grant select on public.chat_direct_members to authenticated;

drop policy if exists chat_messages_read on public.chat_messages;
drop policy if exists chat_messages_insert on public.chat_messages;
create policy chat_messages_read on public.chat_messages for select to authenticated using (public.chat_can_read(channel_id));
create policy chat_messages_insert on public.chat_messages for insert to authenticated
  with check (public.chat_can_post(channel_id) and author_id = auth.uid());
revoke insert, update, delete on public.chat_messages from anon, authenticated;
grant select on public.chat_messages to authenticated;
grant insert (channel_id, body) on public.chat_messages to authenticated;

drop policy if exists chat_reads_own on public.chat_reads;
create policy chat_reads_own on public.chat_reads for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and public.chat_can_read(channel_id));
grant select, insert, update, delete on public.chat_reads to authenticated;

-- Messages take their club from the chat and the author's name from their profile.
create or replace function public.prepare_chat_message() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select club_id into new.club_id from public.chat_channels where id = new.channel_id;
  new.author_id := auth.uid();
  select coalesce(nullif(full_name, ''), 'Member') into new.author_name from public.profiles where id = auth.uid();
  new.author_name := coalesce(new.author_name, 'Member');
  new.body := trim(new.body);
  new.created_at := now();
  new.deleted_at := null;
  return new;
end $$;
drop trigger if exists chat_messages_prepare on public.chat_messages;
create trigger chat_messages_prepare before insert on public.chat_messages
  for each row execute function public.prepare_chat_message();

-- Remove a message: the author, or a moderator (admins, and coaches of that team).
create or replace function public.delete_chat_message(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.chat_messages; me text;
begin
  select * into m from public.chat_messages where id = p_id;
  if m.id is null then raise exception 'Message not found'; end if;
  if not (m.author_id = auth.uid() or public.chat_is_moderator(m.channel_id)) then raise exception 'You can only remove your own messages.'; end if;
  select coalesce(nullif(full_name, ''), 'a coach') into me from public.profiles where id = auth.uid();
  update public.chat_messages set deleted_at = now(), deleted_by_name = case when m.author_id = auth.uid() then null else me end, body = '[removed]'
  where id = p_id;
end $$;
revoke execute on function public.delete_chat_message(uuid) from public, anon;
grant execute on function public.delete_chat_message(uuid) to authenticated;

-- ---------- Channels exist automatically ----------
create or replace function public.make_team_channel() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.chat_channels (club_id, kind, team_id) values (new.club_id, 'team', new.id) on conflict do nothing;
  return null;
end $$;
drop trigger if exists teams_chat on public.teams;
create trigger teams_chat after insert on public.teams for each row execute function public.make_team_channel();

create or replace function public.make_staff_channel() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.chat_channels (club_id, kind) values (new.id, 'staff') on conflict do nothing;
  return null;
end $$;
drop trigger if exists clubs_chat on public.clubs;
create trigger clubs_chat after insert on public.clubs for each row execute function public.make_staff_channel();

insert into public.chat_channels (club_id, kind, team_id)
select t.club_id, 'team', t.id from public.teams t
where not exists (select 1 from public.chat_channels c where c.kind = 'team' and c.team_id = t.id);
insert into public.chat_channels (club_id, kind)
select c.id, 'staff' from public.clubs c
where not exists (select 1 from public.chat_channels x where x.kind = 'staff' and x.club_id = c.id);

-- ---------- Direct messages: adults only ----------
create or replace function public.open_direct_chat(p_club uuid, p_user uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare cid uuid; my_role text; their_role text;
begin
  if p_user = auth.uid() then raise exception 'You can''t message yourself.'; end if;
  select role::text into my_role from public.memberships where club_id = p_club and user_id = auth.uid();
  select role::text into their_role from public.memberships where club_id = p_club and user_id = p_user;
  if my_role is null or their_role is null then raise exception 'You can only message people in your club.'; end if;
  if my_role = 'player' or their_role = 'player' then
    raise exception 'To keep players safe, messages with players go through the team chat, not private messages.';
  end if;
  -- Parents can message staff (not other parents) unless they share a team.
  if my_role = 'parent' and their_role = 'parent' then raise exception 'Parents can message coaches and the club. Use the team chat to reach other parents.'; end if;
  select c.id into cid from public.chat_channels c
  where c.club_id = p_club and c.kind = 'direct'
    and exists (select 1 from public.chat_direct_members a where a.channel_id = c.id and a.user_id = auth.uid())
    and exists (select 1 from public.chat_direct_members b where b.channel_id = c.id and b.user_id = p_user)
  limit 1;
  if cid is null then
    insert into public.chat_channels (club_id, kind) values (p_club, 'direct') returning id into cid;
    insert into public.chat_direct_members (channel_id, user_id) values (cid, auth.uid()), (cid, p_user);
  end if;
  return cid;
end $$;
revoke execute on function public.open_direct_chat(uuid, uuid) from public, anon;
grant execute on function public.open_direct_chat(uuid, uuid) to authenticated;

-- People I may start a direct message with: adults only; parents can message staff, not other parents.
create or replace function public.chat_contacts(p_club uuid)
returns table (user_id uuid, name text, role text)
language sql stable security definer set search_path = '' as $$
  with me as (select m.role::text as role from public.memberships m where m.club_id = p_club and m.user_id = auth.uid())
  select m.user_id, coalesce(nullif(p.full_name, ''), 'Member'), m.role::text
  from public.memberships m join public.profiles p on p.id = m.user_id, me
  where m.club_id = p_club and m.user_id <> auth.uid()
    and me.role <> 'player' and m.role::text <> 'player'
    and not (me.role = 'parent' and m.role::text = 'parent')
  order by case m.role::text when 'admin' then 0 when 'coach' then 1 when 'assistant' then 2 else 3 end, 2
$$;
revoke execute on function public.chat_contacts(uuid) from public, anon;
grant execute on function public.chat_contacts(uuid) to authenticated;

-- ---------- Overview: my chats with the latest message and unread count ----------
create or replace function public.chat_overview(p_club uuid)
returns table (id uuid, kind text, team_id uuid, posting text, name text, last_at timestamptz, last_body text, last_author text, unread int, muted boolean, other_user uuid)
language sql stable security definer set search_path = '' as $$
  select c.id, c.kind, c.team_id, c.posting,
    case c.kind
      when 'team' then (select t.name from public.teams t where t.id = c.team_id)
      when 'staff' then 'Coaches & staff'
      else (select coalesce(nullif(p.full_name, ''), 'Member') from public.chat_direct_members d join public.profiles p on p.id = d.user_id
            where d.channel_id = c.id and d.user_id <> auth.uid() limit 1)
    end,
    lm.created_at, lm.body, lm.author_name,
    (select count(*)::int from public.chat_messages m where m.channel_id = c.id and m.deleted_at is null
       and m.author_id is distinct from auth.uid() and m.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz)),
    coalesce(r.muted, false),
    case when c.kind = 'direct' then (select d.user_id from public.chat_direct_members d where d.channel_id = c.id and d.user_id <> auth.uid() limit 1) end
  from public.chat_channels c
  left join public.chat_reads r on r.channel_id = c.id and r.user_id = auth.uid()
  left join lateral (select m.created_at, m.body, m.author_name from public.chat_messages m where m.channel_id = c.id and m.deleted_at is null order by m.created_at desc limit 1) lm on true
  where c.club_id = p_club and public.chat_can_read(c.id)
    -- Admins can read every team chat, but only see them listed if they have messages or teams of their own.
    and (c.kind <> 'team' or not public.is_admin(c.club_id) or public.in_my_teams(c.team_id) or lm.created_at is not null)
  order by lm.created_at desc nulls last, c.kind, 5
$$;
revoke execute on function public.chat_overview(uuid) from public, anon;
grant execute on function public.chat_overview(uuid) to authenticated;

-- ---------- Notifications: one per chat, a phone buzz at most every few minutes ----------
create or replace function public.notify_chat_message() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c public.chat_channels; ttl text;
begin
  select * into c from public.chat_channels where id = new.channel_id;
  ttl := case c.kind
    when 'team' then (select t.name from public.teams t where t.id = c.team_id) || ' chat'
    when 'staff' then 'Coaches & staff chat'
    else 'Message from ' || new.author_name end;
  insert into public.notifications (user_id, club_id, kind, title, body, url, dedupe)
  select a.user_id, new.club_id, 'message', left(ttl, 200),
    left(case when c.kind = 'direct' then new.body else new.author_name || ': ' || new.body end, 300),
    '/chat?c=' || c.id, 'chat:' || c.id
  from (
    select ta.user_id from public.team_audience(c.team_id) ta where c.kind = 'team'
    union select m.user_id from public.memberships m where c.kind = 'staff' and m.club_id = c.club_id and m.role::text in ('admin', 'coach', 'assistant')
    union select d.user_id from public.chat_direct_members d where c.kind = 'direct' and d.channel_id = c.id
  ) a
  where a.user_id is distinct from new.author_id
    and public.chat_allowed_for(new.club_id, a.user_id)
    and not exists (select 1 from public.chat_reads r where r.channel_id = c.id and r.user_id = a.user_id and r.muted)
  on conflict (user_id, dedupe) do update set
    title = excluded.title, body = excluded.body, created_at = now(), read_at = null,
    -- Already buzzed in the last 5 minutes and still unread? Don't buzz again.
    pushed_at = case when public.notifications.read_at is null and public.notifications.pushed_at > now() - interval '5 minutes'
                     then public.notifications.pushed_at else null end;
  return null;
end $$;
drop trigger if exists chat_messages_notify on public.chat_messages;
create trigger chat_messages_notify after insert on public.chat_messages
  for each row execute function public.notify_chat_message();

notify pgrst, 'reload schema';
