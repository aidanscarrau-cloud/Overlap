-- Overlap: group chats.
-- * Admins, head coaches and assistant coaches create groups, name them and add or remove people.
-- * Adults (staff and parents) can be added freely. Players only if the club's chat settings let them use chat.
-- * Rule of two: a group with any player in it must always have at least two adults.
-- * Club admins can read any group that includes players; adult-only groups are private to their members.
-- * Anyone can leave a group.
-- Safe to run more than once.

alter table public.chat_channels drop constraint if exists chat_channels_kind_check;
alter table public.chat_channels add constraint chat_channels_kind_check check (kind in ('team', 'staff', 'direct', 'group'));
alter table public.chat_channels add column if not exists name text check (char_length(name) <= 60);
alter table public.chat_channels add column if not exists created_by uuid references public.profiles (id) on delete set null;
grant update (name) on public.chat_channels to authenticated;

-- Does this group include any player accounts?
create or replace function public.chat_group_has_players(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.chat_direct_members d join public.chat_channels c on c.id = d.channel_id
    join public.memberships m on m.club_id = c.club_id and m.user_id = d.user_id
    where d.channel_id = cid and m.role::text = 'player'
  )
$$;

create or replace function public.chat_can_read(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.chat_channels c where c.id = cid and public.chat_allowed(c.club_id) and (
      (c.kind = 'team' and public.can_view_team(c.team_id))
      or (c.kind = 'staff' and public.is_staff(c.club_id))
      or (c.kind in ('direct', 'group') and exists (select 1 from public.chat_direct_members d where d.channel_id = c.id and d.user_id = auth.uid()))
      or (c.kind = 'group' and public.is_admin(c.club_id) and public.chat_group_has_players(c.id))
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
      or (c.kind = 'group' and public.is_staff(c.club_id) and exists (select 1 from public.chat_direct_members d where d.channel_id = c.id and d.user_id = auth.uid()))
    )
  )
$$;

-- Checks a proposed member list: everyone in the club, players allowed to chat, and the rule of two.
create or replace function public.check_group_members(p_club uuid, p_users uuid[]) returns void
language plpgsql stable security definer set search_path = '' as $$
declare bad text; adults int; players int;
begin
  select string_agg(coalesce(nullif(p.full_name, ''), 'someone'), ', ') into bad
  from unnest(p_users) u left join public.memberships m on m.club_id = p_club and m.user_id = u left join public.profiles p on p.id = u
  where m.id is null;
  if bad is not null then raise exception 'Not in this club: %', bad; end if;
  select string_agg(coalesce(nullif(p.full_name, ''), 'a player'), ', ') into bad
  from unnest(p_users) u join public.memberships m on m.club_id = p_club and m.user_id = u join public.profiles p on p.id = u
  where m.role::text = 'player' and public.chat_access_for(p_club, u) = 'none';
  if bad is not null then raise exception 'These players can''t use chat under the club''s age setting: %', bad; end if;
  select count(*) filter (where m.role::text <> 'player'), count(*) filter (where m.role::text = 'player') into adults, players
  from unnest(p_users) u join public.memberships m on m.club_id = p_club and m.user_id = u;
  if players > 0 and adults < 2 then
    raise exception 'A group with players needs at least two adults in it (the rule of two). Add another coach or a parent.';
  end if;
end $$;

create or replace function public.create_group_chat(p_club uuid, p_name text, p_members uuid[]) returns uuid
language plpgsql security definer set search_path = '' as $$
declare cid uuid; everyone uuid[];
begin
  if not public.is_staff(p_club) then raise exception 'Only coaches and admins can create group chats.'; end if;
  if nullif(trim(coalesce(p_name, '')), '') is null then raise exception 'Give the group a name.'; end if;
  everyone := array(select distinct x from unnest(array_append(coalesce(p_members, '{}'), auth.uid())) x);
  if array_length(everyone, 1) < 2 then raise exception 'Add at least one other person.'; end if;
  if array_length(everyone, 1) > 100 then raise exception 'A group can have up to 100 people.'; end if;
  perform public.check_group_members(p_club, everyone);
  insert into public.chat_channels (club_id, kind, name, created_by) values (p_club, 'group', left(trim(p_name), 60), auth.uid()) returning id into cid;
  insert into public.chat_direct_members (channel_id, user_id) select cid, x from unnest(everyone) x;
  return cid;
end $$;

create or replace function public.add_group_members(p_channel uuid, p_members uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.chat_channels; everyone uuid[];
begin
  select * into c from public.chat_channels where id = p_channel;
  if c.id is null or c.kind <> 'group' then raise exception 'Group not found'; end if;
  if not public.chat_is_moderator(p_channel) then raise exception 'Only coaches and admins in the group can add people.'; end if;
  everyone := array(select distinct x from (select user_id as x from public.chat_direct_members where channel_id = p_channel union select unnest(p_members)) s);
  perform public.check_group_members(c.club_id, everyone);
  insert into public.chat_direct_members (channel_id, user_id) select p_channel, x from unnest(p_members) x on conflict do nothing;
end $$;

-- Remove someone (coaches/admins in the group), or leave yourself.
create or replace function public.remove_group_member(p_channel uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.chat_channels; rest uuid[];
begin
  select * into c from public.chat_channels where id = p_channel;
  if c.id is null or c.kind <> 'group' then raise exception 'Group not found'; end if;
  if p_user <> auth.uid() and not public.chat_is_moderator(p_channel) then raise exception 'Only coaches and admins in the group can remove people.'; end if;
  rest := array(select user_id from public.chat_direct_members where channel_id = p_channel and user_id <> p_user);
  -- Keep the rule of two: if only players (or one adult with players) would be left, remove the players too.
  if exists (select 1 from unnest(rest) u join public.memberships m on m.club_id = c.club_id and m.user_id = u where m.role::text = 'player')
     and (select count(*) from unnest(rest) u join public.memberships m on m.club_id = c.club_id and m.user_id = u where m.role::text <> 'player') < 2 then
    raise exception 'That would leave players with fewer than two adults in the group. Add another adult first, or remove the players.';
  end if;
  delete from public.chat_direct_members where channel_id = p_channel and user_id = p_user;
end $$;

-- Members of a group (for the members list).
create or replace function public.chat_members(p_channel uuid) returns table (user_id uuid, name text, role text)
language sql stable security definer set search_path = '' as $$
  select d.user_id, coalesce(nullif(p.full_name, ''), 'Member'), m.role::text
  from public.chat_direct_members d join public.chat_channels c on c.id = d.channel_id
  join public.profiles p on p.id = d.user_id
  left join public.memberships m on m.club_id = c.club_id and m.user_id = d.user_id
  where d.channel_id = p_channel and public.chat_can_read(p_channel)
  order by case m.role::text when 'admin' then 0 when 'coach' then 1 when 'assistant' then 2 when 'parent' then 3 else 4 end, 2
$$;

-- People who can be added to a group: everyone in the club except players who can't use chat.
create or replace function public.chat_group_contacts(p_club uuid) returns table (user_id uuid, name text, role text, teams text)
language sql stable security definer set search_path = '' as $$
  select m.user_id, coalesce(nullif(p.full_name, ''), 'Member'), m.role::text,
    coalesce((
      select string_agg(distinct t.name, ', ') from public.teams t
      where t.id in (select mt.team_id from public.member_teams mt where mt.membership_id = m.id)
         or t.id in (select pl.team_id from public.member_players mp join public.players pl on pl.id = mp.player_id where mp.membership_id = m.id)
    ), '')
  from public.memberships m join public.profiles p on p.id = m.user_id
  where m.club_id = p_club and public.is_staff(p_club) and m.user_id <> auth.uid()
    and (m.role::text <> 'player' or public.chat_access_for(p_club, m.user_id) <> 'none')
  order by case m.role::text when 'admin' then 0 when 'coach' then 1 when 'assistant' then 2 when 'parent' then 3 else 4 end, 2
$$;

do $$ begin
  revoke execute on function public.create_group_chat(uuid, text, uuid[]) from public, anon;
  revoke execute on function public.add_group_members(uuid, uuid[]) from public, anon;
  revoke execute on function public.remove_group_member(uuid, uuid) from public, anon;
  revoke execute on function public.chat_members(uuid) from public, anon;
  revoke execute on function public.chat_group_contacts(uuid) from public, anon;
  revoke execute on function public.check_group_members(uuid, uuid[]) from public, anon, authenticated;
end $$;
grant execute on function public.create_group_chat(uuid, text, uuid[]) to authenticated;
grant execute on function public.add_group_members(uuid, uuid[]) to authenticated;
grant execute on function public.remove_group_member(uuid, uuid) to authenticated;
grant execute on function public.chat_members(uuid) to authenticated;
grant execute on function public.chat_group_contacts(uuid) to authenticated;

-- Rename: coaches/admins in the group.
drop policy if exists chat_channels_update on public.chat_channels;
create policy chat_channels_update on public.chat_channels for update to authenticated
  using (kind in ('team', 'group') and public.chat_is_moderator(id)) with check (kind in ('team', 'group') and public.chat_is_moderator(id));

-- Overview and notifications now include groups.
create or replace function public.chat_overview(p_club uuid)
returns table (id uuid, kind text, team_id uuid, posting text, name text, last_at timestamptz, last_body text, last_author text, unread int, muted boolean, other_user uuid)
language sql stable security definer set search_path = '' as $$
  select c.id, c.kind, c.team_id, c.posting,
    case c.kind
      when 'team' then (select t.name from public.teams t where t.id = c.team_id)
      when 'staff' then 'Coaches & staff'
      when 'group' then coalesce(c.name, 'Group')
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
    -- Admins can read all team chats and groups with players, but only see them listed when they're in them or there's activity.
    and (c.kind not in ('team', 'group') or not public.is_admin(c.club_id)
         or (c.kind = 'team' and (public.in_my_teams(c.team_id) or lm.created_at is not null))
         or (c.kind = 'group' and (exists (select 1 from public.chat_direct_members d where d.channel_id = c.id and d.user_id = auth.uid()) or lm.created_at is not null)))
  order by lm.created_at desc nulls last, c.kind, 5
$$;

create or replace function public.notify_chat_message() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c public.chat_channels; ttl text;
begin
  select * into c from public.chat_channels where id = new.channel_id;
  ttl := case c.kind
    when 'team' then (select t.name from public.teams t where t.id = c.team_id) || ' chat'
    when 'staff' then 'Coaches & staff chat'
    when 'group' then coalesce(c.name, 'Group chat')
    else 'Message from ' || new.author_name end;
  insert into public.notifications (user_id, club_id, kind, title, body, url, dedupe)
  select a.user_id, new.club_id, 'message', left(ttl, 200),
    left(case when c.kind = 'direct' then new.body else new.author_name || ': ' || new.body end, 300),
    '/chat?c=' || c.id, 'chat:' || c.id
  from (
    select ta.user_id from public.team_audience(c.team_id) ta where c.kind = 'team'
    union select m.user_id from public.memberships m where c.kind = 'staff' and m.club_id = c.club_id and m.role::text in ('admin', 'coach', 'assistant')
    union select d.user_id from public.chat_direct_members d where c.kind in ('direct', 'group') and d.channel_id = c.id
  ) a
  where a.user_id is distinct from new.author_id
    and public.chat_allowed_for(new.club_id, a.user_id)
    and not exists (select 1 from public.chat_reads r where r.channel_id = c.id and r.user_id = a.user_id and r.muted)
  on conflict (user_id, dedupe) do update set
    title = excluded.title, body = excluded.body, created_at = now(), read_at = null,
    pushed_at = case when public.notifications.read_at is null and public.notifications.pushed_at > now() - interval '5 minutes'
                     then public.notifications.pushed_at else null end;
  return null;
end $$;

notify pgrst, 'reload schema';
