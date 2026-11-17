-- Overlap: reply to a message, and emoji reactions, in chat.
-- Replies quote a message from the same chat. Reactions: one per person per message (tap another to change it),
-- from a fixed set. Anyone who can read the chat and has full chat access can react, including parents in
-- "coaches only" team chats; younger players with read-only access can't. Safe to run more than once.

alter table public.chat_messages add column if not exists reply_to uuid references public.chat_messages(id) on delete set null;
grant insert (reply_to) on public.chat_messages to authenticated;

create or replace function public.prepare_chat_message() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select club_id into new.club_id from public.chat_channels where id = new.channel_id;
  new.author_id := auth.uid();
  select coalesce(nullif(full_name, ''), 'Member') into new.author_name from public.profiles where id = auth.uid();
  new.author_name := coalesce(new.author_name, 'Member');
  new.body := trim(coalesce(new.body, ''));
  new.created_at := now();
  new.deleted_at := null;
  -- An image must live in this chat's own folder.
  if new.image_path is not null and new.image_path not like new.club_id || '/' || new.channel_id || '/%' then
    raise exception 'That picture doesn''t belong to this chat.';
  end if;
  -- A reply must quote a message in the same chat.
  if new.reply_to is not null and not exists (select 1 from public.chat_messages m where m.id = new.reply_to and m.channel_id = new.channel_id) then
    raise exception 'You can only reply to a message in this chat.';
  end if;
  return new;
end $$;

create table if not exists public.chat_reactions (
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  channel_id uuid not null references public.chat_channels(id) on delete cascade,
  emoji text not null check (emoji in ('👍', '❤️', '😂', '😮', '😢', '🔥', '⚽', '👏')),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
create index if not exists chat_reactions_channel on public.chat_reactions (channel_id);
alter table public.chat_reactions enable row level security;

create or replace function public.chat_can_react(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.chat_can_read(cid) and exists (
    select 1 from public.chat_channels c where c.id = cid and public.chat_access_for(c.club_id, auth.uid()) = 'write'
  )
$$;
grant execute on function public.chat_can_react(uuid) to authenticated;

-- React to a message: the same emoji again takes it off, a different one swaps it.
create or replace function public.react_to_message(p_message uuid, p_emoji text) returns text
language plpgsql security definer set search_path = '' as $$
declare cid uuid; cur text;
begin
  select channel_id into cid from public.chat_messages where id = p_message and deleted_at is null;
  if cid is null then raise exception 'That message is no longer there.'; end if;
  if not public.chat_can_react(cid) then raise exception 'You can''t react in this chat.'; end if;
  select emoji into cur from public.chat_reactions where message_id = p_message and user_id = auth.uid();
  if cur = p_emoji or p_emoji is null then
    delete from public.chat_reactions where message_id = p_message and user_id = auth.uid();
    return null;
  end if;
  insert into public.chat_reactions (message_id, user_id, channel_id, emoji) values (p_message, auth.uid(), cid, p_emoji)
  on conflict (message_id, user_id) do update set emoji = excluded.emoji, created_at = now();
  return p_emoji;
end $$;
grant execute on function public.react_to_message(uuid, text) to authenticated;

drop policy if exists chat_reactions_read on public.chat_reactions;
create policy chat_reactions_read on public.chat_reactions for select to authenticated using (public.chat_can_read(channel_id));
revoke insert, update, delete on public.chat_reactions from authenticated;
grant select on public.chat_reactions to authenticated;

-- Removing a message also clears its reactions.
create or replace function public.delete_chat_message(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.chat_messages; me text;
begin
  select * into m from public.chat_messages where id = p_id;
  if m.id is null then raise exception 'Message not found'; end if;
  if not (m.author_id = auth.uid() or public.chat_is_moderator(m.channel_id)) then raise exception 'You can only remove your own messages.'; end if;
  select coalesce(nullif(full_name, ''), 'a coach') into me from public.profiles where id = auth.uid();
  update public.chat_messages set deleted_at = now(), deleted_by_name = case when m.author_id = auth.uid() then null else me end,
    body = '[removed]', image_path = null, image_w = null, image_h = null
  where id = p_id;
  delete from public.chat_reactions where message_id = p_id;
end $$;

notify pgrst, 'reload schema';
