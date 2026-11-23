-- Overlap: helping improve Overlap's automatic match analysis. A club admin can let a team's tagged match
-- clips be used to train Overlap's own models (off by default; admins only; can be withdrawn, which deletes
-- the club's training clips). Only the event labels go with the clips: no names or contact details.
-- Needs update 38. Safe to run more than once.

alter table public.teams add column if not exists training_opt_in boolean not null default false;
alter table public.teams add column if not exists training_opt_in_at timestamptz;
alter table public.teams add column if not exists training_opt_in_by uuid;

create or replace function public.keep_team_match_ai() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.match_ai is distinct from old.match_ai or new.video_ai is distinct from old.video_ai or new.training_opt_in is distinct from old.training_opt_in)
     and auth.uid() is not null and not public.is_admin(new.club_id) then
    raise exception 'Only club admins can change match review settings for a team';
  end if;
  -- Record who agreed, and when.
  if new.training_opt_in and not coalesce(old.training_opt_in, false) then
    new.training_opt_in_at := now();
    new.training_opt_in_by := auth.uid();
  end if;
  return new;
end $$;

-- Which matches' clips have been collected, so each is only collected once (and again if more tags are added).
create table if not exists public.training_exports (
  match_id uuid primary key references public.matches (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete cascade,
  status text not null default 'sent' check (status in ('sent', 'done', 'failed')),
  clips int not null default 0,
  message text not null default '' check (char_length(message) <= 300),
  exported_at timestamptz not null default now()
);
create index if not exists training_exports_club_idx on public.training_exports (club_id);
alter table public.training_exports enable row level security;
drop policy if exists training_exports_read on public.training_exports;
create policy training_exports_read on public.training_exports for select to authenticated using (public.is_admin(club_id));
revoke all on public.training_exports from authenticated;
grant select on public.training_exports to authenticated;

notify pgrst, 'reload schema';
