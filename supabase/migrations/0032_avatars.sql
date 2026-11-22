-- Overlap: profile pictures for accounts.
-- Pictures live in a public Storage bucket "avatars", in a folder named after the person:
--   avatars/<user_id>/<random>.webp   (a random name, so addresses can't be guessed)
-- Everyone can upload, change or remove only their own picture. Safe to run more than once.

alter table public.profiles add column if not exists avatar_url text check (avatar_url is null or char_length(avatar_url) <= 500);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists avatars_own_insert on storage.objects;
drop policy if exists avatars_own_update on storage.objects;
drop policy if exists avatars_own_delete on storage.objects;
create policy avatars_own_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and split_part(name, '/', 1) = auth.uid()::text);
create policy avatars_own_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and split_part(name, '/', 1) = auth.uid()::text)
  with check (bucket_id = 'avatars' and split_part(name, '/', 1) = auth.uid()::text);
create policy avatars_own_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and split_part(name, '/', 1) = auth.uid()::text);

-- The picture address must be one of the person's own uploads (no pointing at someone else's file or another site).
create or replace function public.check_avatar_url() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.avatar_url is not null and new.avatar_url !~ ('/storage/v1/object/public/avatars/' || new.id::text || '/[A-Za-z0-9_-]+\.(webp|png|jpe?g)$') then
    raise exception 'That picture address is not allowed.';
  end if;
  return new;
end $$;
drop trigger if exists profiles_check_avatar on public.profiles;
create trigger profiles_check_avatar before insert or update of avatar_url on public.profiles for each row execute function public.check_avatar_url();

notify pgrst, 'reload schema';
