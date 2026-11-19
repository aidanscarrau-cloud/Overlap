-- Overlap: injuries and return to play.
-- Coaches log injuries and move players through return-to-play stages; players and parents can report
-- an injury for their own player. While a player has an open injury they show as injured; when the last
-- one is marked recovered they're available again. Coaches and the player's family are notified.
-- Safe to run more than once.

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'session_new', 'session_changed', 'session_cancelled', 'announcement', 'reply_reminder', 'evaluation', 'goal',
  'match_new', 'match_changed', 'match_cancelled', 'squad', 'result', 'self_review', 'self_review_done', 'message',
  'injury'
));

create table if not exists public.player_injuries (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  body_part text not null check (body_part ~ '^[a-z_]{2,20}$'),
  side text not null default 'na' check (side in ('left', 'right', 'both', 'na')),
  kind text not null check (kind in ('sprain', 'strain', 'knock', 'fracture', 'concussion', 'illness', 'overuse', 'other')),
  severity text not null default 'minor' check (severity in ('minor', 'moderate', 'serious')),
  occurred_on date not null default current_date,
  cause text not null default 'training' check (cause in ('training', 'match', 'outside', 'unknown')),
  notes text not null default '' check (char_length(notes) <= 1000),
  expected_return date,
  stage int not null default 1 check (stage between 1 and 6),
  cleared_by_doctor boolean not null default false,
  status text not null default 'active' check (status in ('active', 'recovered')),
  recovered_on date,
  reported_by_family boolean not null default false,
  created_by uuid default auth.uid(),
  created_by_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists player_injuries_player on public.player_injuries (player_id, status);
create index if not exists player_injuries_club on public.player_injuries (club_id, occurred_on);

create or replace function public.prepare_injury() returns trigger
language plpgsql security definer set search_path = '' as $$
declare staff boolean;
begin
  select p.team_id, t.club_id into new.team_id, new.club_id from public.players p join public.teams t on t.id = p.team_id where p.id = new.player_id;
  if new.club_id is null then raise exception 'Player not found.'; end if;
  staff := public.can_do(new.team_id, 'squad.edit');
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    select coalesce(nullif(full_name, ''), 'Member') into new.created_by_name from public.profiles where id = auth.uid();
    new.created_by_name := coalesce(new.created_by_name, 'Member');
    new.reported_by_family := not staff;
    if not staff then new.stage := 1; new.cleared_by_doctor := false; new.status := 'active'; end if;
  end if;
  -- Concussion: no return to full training or games without a doctor's clearance.
  if new.kind = 'concussion' and new.stage >= 5 and not new.cleared_by_doctor then
    raise exception 'A concussion needs a doctor''s clearance before full training.';
  end if;
  if new.status = 'recovered' then new.recovered_on := coalesce(new.recovered_on, current_date); else new.recovered_on := null; end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists player_injuries_prepare on public.player_injuries;
create trigger player_injuries_prepare before insert or update on public.player_injuries for each row execute function public.prepare_injury();

-- Availability follows open injuries; coaches and the player's family hear about it.
create or replace function public.after_injury() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r public.player_injuries; open_n int; pname text; label text; ttl text; bdy text;
begin
  r := coalesce(new, old);
  select count(*) into open_n from public.player_injuries where player_id = r.player_id and status = 'active';
  select full_name into pname from public.players where id = r.player_id;
  label := initcap(replace(r.body_part, '_', ' ')) || ' ' || r.kind;
  if open_n > 0 then
    update public.players set status = 'injured',
      status_note = left(label || coalesce(', back ~' || to_char((select min(expected_return) from public.player_injuries where player_id = r.player_id and status = 'active'), 'DD Mon'), ''), 120)
    where id = r.player_id and (status <> 'injured' or status_note is distinct from left(label, 120));
  else
    update public.players set status = 'available', status_note = '' where id = r.player_id and status = 'injured';
  end if;
  if tg_op = 'DELETE' then return null; end if;

  if tg_op = 'INSERT' then
    ttl := 'Injury: ' || pname;
    bdy := label || case when new.reported_by_family then ' (reported by ' || new.created_by_name || ')' else '' end;
  elsif new.status = 'recovered' and old.status <> 'recovered' then
    ttl := pname || ' is back';
    bdy := 'Recovered from ' || lower(label) || '. Available again.';
  elsif new.stage <> old.stage then
    ttl := pname || ': return to play';
    bdy := 'Now at stage ' || new.stage || ' of 6 (' || lower(label) || ').';
  else
    return null;
  end if;
  insert into public.notifications (user_id, club_id, kind, title, body, url, dedupe)
  select a.user_id, new.club_id, 'injury', left(ttl, 200), left(bdy, 300), '/squad', 'injury:' || new.id
  from (
    select m.user_id from public.memberships m join public.member_teams mt on mt.membership_id = m.id
      where mt.team_id = new.team_id and m.role::text in ('coach', 'assistant')
    union select m.user_id from public.memberships m where m.club_id = new.club_id and m.role::text = 'admin'
    union select m.user_id from public.member_players mp join public.memberships m on m.id = mp.membership_id where mp.player_id = new.player_id
  ) a
  where a.user_id is distinct from auth.uid()
  on conflict (user_id, dedupe) do update set title = excluded.title, body = excluded.body, created_at = now(), read_at = null, pushed_at = null;
  return null;
end $$;
drop trigger if exists player_injuries_after on public.player_injuries;
create trigger player_injuries_after after insert or update or delete on public.player_injuries for each row execute function public.after_injury();

alter table public.player_injuries enable row level security;
drop policy if exists player_injuries_read on public.player_injuries;
drop policy if exists player_injuries_insert on public.player_injuries;
drop policy if exists player_injuries_update on public.player_injuries;
drop policy if exists player_injuries_delete on public.player_injuries;
create policy player_injuries_read on public.player_injuries for select to authenticated
  using ((public.can_view_team(team_id) and public.is_staff(club_id)) or public.is_linked_player(player_id));
create policy player_injuries_insert on public.player_injuries for insert to authenticated
  with check (public.can_do((select team_id from public.players where id = player_id), 'squad.edit') or public.is_linked_player(player_id));
create policy player_injuries_update on public.player_injuries for update to authenticated
  using (public.can_do(team_id, 'squad.edit')) with check (public.can_do(team_id, 'squad.edit'));
create policy player_injuries_delete on public.player_injuries for delete to authenticated using (public.can_do(team_id, 'squad.edit'));
grant select, insert, update, delete on public.player_injuries to authenticated;

notify pgrst, 'reload schema';
