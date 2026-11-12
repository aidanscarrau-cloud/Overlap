-- Overlap: the club admin chooses what players under the chat age can do in team chats:
-- 'none' = no chat (the default), 'read' = read team chats only, 'write' = read and send in team chats.
-- Players at or over the age always have full team chat. Private messages are never open to any player.
-- Safe to run more than once.

alter table public.clubs add column if not exists chat_young_access text not null default 'none';
alter table public.clubs drop constraint if exists clubs_chat_young_access_check;
alter table public.clubs add constraint clubs_chat_young_access_check check (chat_young_access in ('none', 'read', 'write'));

-- What can this member do in team chat? 'write', 'read' or 'none'.
create or replace function public.chat_access_for(p_club uuid, p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case
      when m.role::text <> 'player' then 'write'
      when exists (select 1 from public.member_players mp where mp.membership_id = m.id and public.chat_age_ok(mp.player_id)) then 'write'
      else (select c.chat_young_access from public.clubs c where c.id = p_club)
    end
    from public.memberships m where m.club_id = p_club and m.user_id = p_user
  ), 'none')
$$;

create or replace function public.chat_allowed_for(p_club uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.chat_access_for(p_club, p_user) <> 'none'
$$;

-- For the app: my access level and the club's age limit.
create or replace function public.chat_access(p_club uuid) returns table (access text, min_age int, young_access text)
language sql stable security definer set search_path = '' as $$
  select public.chat_access_for(p_club, auth.uid()), c.chat_min_age, c.chat_young_access
  from public.clubs c where c.id = p_club and public.is_member(p_club)
$$;
revoke execute on function public.chat_access(uuid) from public, anon;
grant execute on function public.chat_access(uuid) to authenticated;

-- Posting also needs 'write' access (younger players may be read-only).
create or replace function public.chat_can_post(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.chat_can_read(cid) and exists (
    select 1 from public.chat_channels c where c.id = cid
      and (c.posting = 'all' or public.chat_is_moderator(cid))
      and public.chat_access_for(c.club_id, auth.uid()) = 'write'
  )
$$;

notify pgrst, 'reload schema';
