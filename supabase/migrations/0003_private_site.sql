-- Overlap: keep the site private to your club
-- Once a club exists, nobody can start another one unless allow_new_clubs is turned on.
-- New people can still create an account, but they only get into a club with an invite code.
-- To open the site to other clubs later, run:
--   update public.app_settings set allow_new_clubs = true where id = 1;

create table if not exists public.app_settings (
  id int primary key default 1 check (id = 1),
  allow_new_clubs boolean not null default false
);
insert into public.app_settings (id) values (1) on conflict (id) do nothing;

-- No direct access from the app; it reads the setting through new_clubs_allowed().
alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;

create or replace function public.new_clubs_allowed() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select allow_new_clubs from public.app_settings where id = 1), false)
      or not exists (select 1 from public.clubs)
$$;
grant execute on function public.new_clubs_allowed() to anon, authenticated;

create or replace function public.create_club(club_name text, your_name text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if not public.new_clubs_allowed() then
    raise exception 'This site is private to one club. Ask your club for an invite code to join.';
  end if;
  insert into public.profiles (id, full_name) values (auth.uid(), left(coalesce(your_name, ''), 80))
    on conflict (id) do update set full_name = case when excluded.full_name <> '' then excluded.full_name else public.profiles.full_name end;
  insert into public.clubs (name) values (trim(club_name)) returning id into new_id;
  insert into public.memberships (club_id, user_id, role) values (new_id, auth.uid(), 'admin');
  return new_id;
end $$;
