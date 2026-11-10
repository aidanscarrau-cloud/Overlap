-- Overlap: club logos and team badges
-- Images live in a public Storage bucket called "logos", in a folder named after the club:
--   logos/<club_id>/club-<timestamp>.webp
--   logos/<club_id>/team-<team_id>-<timestamp>.webp
-- Anyone can view them (they show on the sign-in pages and in emails later); only club admins can change them.

alter table public.clubs add column if not exists logo_url text check (logo_url is null or char_length(logo_url) <= 500);
alter table public.teams add column if not exists logo_url text check (logo_url is null or char_length(logo_url) <= 500);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- True when the first folder of a storage path is a club the caller administers.
create or replace function public.is_admin_of_path(object_name text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare folder text := split_part(object_name, '/', 1);
begin
  if folder !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return public.is_admin(folder::uuid);
end $$;

drop policy if exists logos_admin_select on storage.objects;
drop policy if exists logos_admin_insert on storage.objects;
drop policy if exists logos_admin_update on storage.objects;
drop policy if exists logos_admin_delete on storage.objects;

create policy logos_admin_select on storage.objects for select to authenticated
  using (bucket_id = 'logos' and public.is_admin_of_path(name));
create policy logos_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'logos' and public.is_admin_of_path(name));
create policy logos_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'logos' and public.is_admin_of_path(name))
  with check (bucket_id = 'logos' and public.is_admin_of_path(name));
create policy logos_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'logos' and public.is_admin_of_path(name));
