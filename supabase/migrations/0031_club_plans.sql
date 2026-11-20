-- Overlap: Lite (free) and Pro plans for each club.
-- Lite: schedule, replies, chat, announcements, notifications, squad and register.
-- Pro: adds drills and session plans, line-ups, trials, development, fitness, injuries, insights,
-- club colours and badge, and player import.
-- Only Overlap (you, in the SQL editor) can change a club's plan; club admins can't change it themselves.
-- Clubs that already exist when this runs are put on Pro (your own club, for the test season).
-- To change a club later:  update public.clubs set plan = 'pro' where name = 'Club name';
-- Safe to run more than once.

alter table public.clubs add column if not exists plan text not null default 'lite';
alter table public.clubs drop constraint if exists clubs_plan_check;
alter table public.clubs add constraint clubs_plan_check check (plan in ('lite', 'pro'));

-- Existing clubs (made before plans existed) start on Pro, once.
create table if not exists public.app_flags (key text primary key, done_at timestamptz not null default now());
alter table public.app_flags enable row level security;
revoke all on public.app_flags from anon, authenticated;
do $$
begin
  if not exists (select 1 from public.app_flags where key = 'plans_seeded') then
    update public.clubs set plan = 'pro';
    insert into public.app_flags (key) values ('plans_seeded');
  end if;
end $$;

-- Club admins can rename their club and change its colours, but not its plan.
create or replace function public.keep_club_plan() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.plan is distinct from old.plan and auth.uid() is not null then
    new.plan := old.plan;
  end if;
  return new;
end $$;
drop trigger if exists clubs_keep_plan on public.clubs;
create trigger clubs_keep_plan before update on public.clubs for each row execute function public.keep_club_plan();

create or replace function public.club_is_pro(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select plan = 'pro' from public.clubs where id = c), false)
$$;
grant execute on function public.club_is_pro(uuid) to authenticated;

notify pgrst, 'reload schema';
