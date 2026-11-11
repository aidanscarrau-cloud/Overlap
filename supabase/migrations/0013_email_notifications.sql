-- Overlap: email notifications as well as phone push.
-- Safe to run more than once.

-- How often each person wants an email copy:
--   always   = every notification (the default)
--   no_phone = only when they haven't turned on phone notifications anywhere
--   never    = no emails
alter table public.notification_prefs add column if not exists email text not null default 'always';
alter table public.notification_prefs drop constraint if exists notification_prefs_email_check;
alter table public.notification_prefs add constraint notification_prefs_email_check check (email in ('always', 'no_phone', 'never'));

-- Email addresses for the people about to be notified. The app's server only (never browsers).
create or replace function public.notification_contacts(ids uuid[])
returns table (user_id uuid, email text, full_name text)
language sql stable security definer set search_path = '' as $$
  select u.id, u.email::text, coalesce(nullif(p.full_name, ''), '')
  from auth.users u left join public.profiles p on p.id = u.id
  where u.id = any(ids) and u.email is not null and u.email <> ''
$$;
revoke execute on function public.notification_contacts(uuid[]) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.notification_contacts(uuid[]) to service_role;
  end if;
end $$;

notify pgrst, 'reload schema';
