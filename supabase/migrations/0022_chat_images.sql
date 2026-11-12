-- Overlap: pictures, screenshots and GIFs in chat.
-- Images go in a private Storage bucket "chat" at <club_id>/<chat_id>/<random>.<ext>.
-- Only people who can read a chat can see its images (through short-lived links); only people who can
-- post in it can upload. Removing a message hides its image. Safe to run more than once.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat', 'chat', false, 8388608, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- The chat a storage path belongs to (its second folder), if the first folder is that chat's club.
create or replace function public.chat_of_path(object_name text) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare club text := split_part(object_name, '/', 1); chat text := split_part(object_name, '/', 2); cid uuid;
begin
  if club !~* '^[0-9a-f-]{36}$' or chat !~* '^[0-9a-f-]{36}$' then return null; end if;
  select id into cid from public.chat_channels where id = chat::uuid and club_id = club::uuid;
  return cid;
end $$;

drop policy if exists chat_images_select on storage.objects;
drop policy if exists chat_images_insert on storage.objects;
create policy chat_images_select on storage.objects for select to authenticated
  using (bucket_id = 'chat' and public.chat_can_read(public.chat_of_path(name)));
create policy chat_images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'chat' and public.chat_can_post(public.chat_of_path(name)));

-- Messages can carry one image; the text is optional when there is one.
alter table public.chat_messages add column if not exists image_path text check (char_length(image_path) <= 300);
alter table public.chat_messages add column if not exists image_w int check (image_w between 1 and 10000);
alter table public.chat_messages add column if not exists image_h int check (image_h between 1 and 10000);
alter table public.chat_messages drop constraint if exists chat_messages_body_check;
alter table public.chat_messages drop constraint if exists chat_messages_body_or_image;
alter table public.chat_messages add constraint chat_messages_body_or_image check (
  char_length(body) <= 2000 and (char_length(trim(body)) >= 1 or image_path is not null)
);
grant insert (image_path, image_w, image_h) on public.chat_messages to authenticated;

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
  return new;
end $$;

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
end $$;

-- Overview and notifications: a picture with no text shows as "📷 Photo".
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
  left join lateral (
    select m.created_at, case when m.body = '' and m.image_path is not null then '📷 Photo' else m.body end as body, m.author_name
    from public.chat_messages m where m.channel_id = c.id and m.deleted_at is null order by m.created_at desc limit 1
  ) lm on true
  where c.club_id = p_club and public.chat_can_read(c.id)
    and (c.kind not in ('team', 'group') or not public.is_admin(c.club_id)
         or (c.kind = 'team' and (public.in_my_teams(c.team_id) or lm.created_at is not null))
         or (c.kind = 'group' and (exists (select 1 from public.chat_direct_members d where d.channel_id = c.id and d.user_id = auth.uid()) or lm.created_at is not null)))
  order by lm.created_at desc nulls last, c.kind, 5
$$;

create or replace function public.notify_chat_message() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c public.chat_channels; ttl text; txt text;
begin
  select * into c from public.chat_channels where id = new.channel_id;
  txt := case when new.body = '' and new.image_path is not null then '📷 Photo' else new.body end;
  ttl := case c.kind
    when 'team' then (select t.name from public.teams t where t.id = c.team_id) || ' chat'
    when 'staff' then 'Coaches & staff chat'
    when 'group' then coalesce(c.name, 'Group chat')
    else 'Message from ' || new.author_name end;
  insert into public.notifications (user_id, club_id, kind, title, body, url, dedupe)
  select a.user_id, new.club_id, 'message', left(ttl, 200),
    left(case when c.kind = 'direct' then txt else new.author_name || ': ' || txt end, 300),
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
