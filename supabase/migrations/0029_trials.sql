-- Overlap: trials. A team runs trials with a public sign-up form (or imports a spreadsheet from another
-- form), coaches check triallists in and rate them on trial nights, then send offers. Accepting an offer
-- adds the player to the team and gives the family an invite to join the club on Overlap.
-- Applicants' details are only visible to the staff of that team. Safe to run more than once.

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'session_new', 'session_changed', 'session_cancelled', 'announcement', 'reply_reminder', 'evaluation', 'goal',
  'match_new', 'match_changed', 'match_cancelled', 'squad', 'result', 'self_review', 'self_review_done', 'message',
  'injury', 'trial'
));

create table if not exists public.trials (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 2 and 80),
  intro text not null default '' check (char_length(intro) <= 2000),
  slug text not null unique default lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
  status text not null default 'open' check (status in ('open', 'closed', 'done')),
  closes_on date,
  agreements text[] not null default '{}' check (cardinality(agreements) <= 10),
  ask_player_contact boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists trials_team on public.trials (team_id, created_at);

create table if not exists public.trial_dates (
  id uuid primary key default gen_random_uuid(),
  trial_id uuid not null references public.trials(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  date date not null,
  start_time time not null default '18:00',
  end_time time,
  location text not null default '' check (char_length(location) <= 120),
  created_at timestamptz not null default now()
);
create index if not exists trial_dates_trial on public.trial_dates (trial_id, date);

create table if not exists public.trial_applicants (
  id uuid primary key default gen_random_uuid(),
  trial_id uuid not null references public.trials(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) between 2 and 80),
  name_key text generated always as (lower(regexp_replace(trim(full_name), '\s+', ' ', 'g'))) stored,
  dob date,
  current_club text not null default '' check (char_length(current_club) <= 80),
  positions text not null default '' check (char_length(positions) <= 120),
  parent_name text not null default '' check (char_length(parent_name) <= 80),
  parent_phone text not null default '' check (char_length(parent_phone) <= 30),
  parent_email text not null default '' check (char_length(parent_email) <= 120),
  player_phone text not null default '' check (char_length(player_phone) <= 30),
  player_email text not null default '' check (char_length(player_email) <= 120),
  agreed jsonb not null default '{}',
  notes text not null default '' check (char_length(notes) <= 2000),
  status text not null default 'applied' check (status in ('applied', 'shortlisted', 'offered', 'accepted', 'declined', 'not_selected')),
  source text not null default 'form' check (source in ('form', 'import', 'manual')),
  offer_token uuid not null unique default gen_random_uuid(),
  offered_at timestamptz,
  responded_at timestamptz,
  last_emailed text,
  last_emailed_at timestamptz,
  player_id uuid references public.players(id) on delete set null,
  invite_code text,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
drop index if exists public.trial_applicants_one;
create unique index trial_applicants_one on public.trial_applicants (trial_id, name_key, dob) nulls not distinct;
create index if not exists trial_applicants_trial on public.trial_applicants (trial_id, status);

create table if not exists public.trial_attendance (
  applicant_id uuid not null references public.trial_applicants(id) on delete cascade,
  date_id uuid not null references public.trial_dates(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (applicant_id, date_id)
);

create table if not exists public.trial_ratings (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references public.trial_applicants(id) on delete cascade,
  date_id uuid references public.trial_dates(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  rated_by uuid not null default auth.uid(),
  rated_by_name text not null default '',
  rating int check (rating between 1 and 5),
  notes text not null default '' check (char_length(notes) <= 1000),
  updated_at timestamptz not null default now()
);
drop index if exists public.trial_ratings_one;
create unique index trial_ratings_one on public.trial_ratings (applicant_id, date_id, rated_by) nulls not distinct;

-- Club and team always come from the trial, never from what the app sends.
create or replace function public.prepare_trial() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select club_id into new.club_id from public.teams where id = new.team_id;
  if tg_op = 'INSERT' then new.created_by := auth.uid(); end if;
  return new;
end $$;
drop trigger if exists trials_prepare on public.trials;
create trigger trials_prepare before insert or update on public.trials for each row execute function public.prepare_trial();

create or replace function public.prepare_trial_child() returns trigger
language plpgsql security definer set search_path = '' as $$
declare tid uuid;
begin
  if tg_table_name in ('trial_attendance', 'trial_ratings') then
    select trial_id into tid from public.trial_applicants where id = new.applicant_id;
    if new.date_id is not null and not exists (select 1 from public.trial_dates where id = new.date_id and trial_id = tid) then
      raise exception 'That trial night belongs to another trial.';
    end if;
  else
    tid := new.trial_id;
  end if;
  select club_id, team_id into new.club_id, new.team_id from public.trials where id = tid;
  if new.club_id is null then raise exception 'Trial not found.'; end if;
  if tg_table_name = 'trial_ratings' then
    new.rated_by := auth.uid();
    select coalesce(nullif(full_name, ''), 'Coach') into new.rated_by_name from public.profiles where id = auth.uid();
    new.rated_by_name := coalesce(new.rated_by_name, 'Coach');
    new.updated_at := now();
  end if;
  return new;
end $$;
drop trigger if exists trial_dates_prepare on public.trial_dates;
create trigger trial_dates_prepare before insert or update on public.trial_dates for each row execute function public.prepare_trial_child();
drop trigger if exists trial_applicants_prepare on public.trial_applicants;
create trigger trial_applicants_prepare before insert or update on public.trial_applicants for each row execute function public.prepare_trial_child();
drop trigger if exists trial_attendance_prepare on public.trial_attendance;
create trigger trial_attendance_prepare before insert or update on public.trial_attendance for each row execute function public.prepare_trial_child();
drop trigger if exists trial_ratings_prepare on public.trial_ratings;
create trigger trial_ratings_prepare before insert or update on public.trial_ratings for each row execute function public.prepare_trial_child();

-- Staff of the team see everything about its trials; coaches with "edit squad" run them;
-- anyone on the team's staff can check triallists in and rate them.
create or replace function public.trial_staff(t uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.can_view_team(t) and public.is_staff((select club_id from public.teams where id = t))
$$;
grant execute on function public.trial_staff(uuid) to authenticated;

alter table public.trials enable row level security;
alter table public.trial_dates enable row level security;
alter table public.trial_applicants enable row level security;
alter table public.trial_attendance enable row level security;
alter table public.trial_ratings enable row level security;

drop policy if exists trials_read on public.trials;
drop policy if exists trials_write on public.trials;
create policy trials_read on public.trials for select to authenticated using (public.trial_staff(team_id));
create policy trials_write on public.trials for all to authenticated using (public.can_do(team_id, 'squad.edit')) with check (public.can_do(team_id, 'squad.edit'));

drop policy if exists trial_dates_read on public.trial_dates;
drop policy if exists trial_dates_write on public.trial_dates;
create policy trial_dates_read on public.trial_dates for select to authenticated using (public.trial_staff(team_id));
create policy trial_dates_write on public.trial_dates for all to authenticated
  using (public.can_do(team_id, 'squad.edit'))
  with check (public.can_do((select team_id from public.trials where id = trial_id), 'squad.edit'));

drop policy if exists trial_applicants_read on public.trial_applicants;
drop policy if exists trial_applicants_write on public.trial_applicants;
create policy trial_applicants_read on public.trial_applicants for select to authenticated using (public.trial_staff(team_id));
create policy trial_applicants_write on public.trial_applicants for all to authenticated
  using (public.can_do(team_id, 'squad.edit'))
  with check (public.can_do((select team_id from public.trials where id = trial_id), 'squad.edit'));

drop policy if exists trial_attendance_read on public.trial_attendance;
drop policy if exists trial_attendance_write on public.trial_attendance;
create policy trial_attendance_read on public.trial_attendance for select to authenticated using (public.trial_staff(team_id));
create policy trial_attendance_write on public.trial_attendance for all to authenticated
  using (public.trial_staff(team_id))
  with check (public.trial_staff((select team_id from public.trial_applicants where id = applicant_id)));

drop policy if exists trial_ratings_read on public.trial_ratings;
drop policy if exists trial_ratings_write on public.trial_ratings;
create policy trial_ratings_read on public.trial_ratings for select to authenticated using (public.trial_staff(team_id));
create policy trial_ratings_write on public.trial_ratings for all to authenticated
  using (rated_by = auth.uid() and public.trial_staff(team_id))
  with check (public.trial_staff((select team_id from public.trial_applicants where id = applicant_id)));

grant select, insert, update, delete on public.trials, public.trial_dates, public.trial_applicants, public.trial_attendance, public.trial_ratings to authenticated;

-- Tell the team's coaches (and club admins) about trial activity.
create or replace function public.notify_trial_staff(p_trial uuid, p_title text, p_body text, p_dedupe text)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, club_id, kind, title, body, url, dedupe)
  select a.user_id, t.club_id, 'trial', left(p_title, 200), left(p_body, 300), '/trials?t=' || t.id, p_dedupe
  from public.trials t
  join lateral (
    select m.user_id from public.memberships m join public.member_teams mt on mt.membership_id = m.id
      where mt.team_id = t.team_id and m.role::text in ('coach', 'assistant')
    union select m.user_id from public.memberships m where m.club_id = t.club_id and m.role::text = 'admin'
  ) a on true
  where t.id = p_trial
  on conflict (user_id, dedupe) do update set title = excluded.title, body = excluded.body, created_at = now(), read_at = null, pushed_at = null
$$;
revoke all on function public.notify_trial_staff(uuid, text, text, text) from public, anon, authenticated;

-- What the public sign-up page shows. Anyone with the link can see it; no personal details.
create or replace function public.trial_public(p_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', t.id, 'title', t.title, 'intro', t.intro, 'closes_on', t.closes_on,
    'open', t.status = 'open' and (t.closes_on is null or t.closes_on >= (now() at time zone 'Australia/Sydney')::date),
    'agreements', to_jsonb(t.agreements), 'ask_player_contact', t.ask_player_contact,
    'team', tm.name,
    'club', jsonb_build_object('name', c.name, 'logo', c.logo_url, 'primary', c.brand_primary, 'accent', c.brand_accent),
    'dates', coalesce((select jsonb_agg(jsonb_build_object('date', d.date, 'start', to_char(d.start_time, 'HH24:MI'), 'end', to_char(d.end_time, 'HH24:MI'), 'location', d.location) order by d.date, d.start_time)
                       from public.trial_dates d where d.trial_id = t.id), '[]'::jsonb)
  )
  from public.trials t join public.teams tm on tm.id = t.team_id join public.clubs c on c.id = t.club_id
  where t.slug = lower(trim(p_slug))
$$;
grant execute on function public.trial_public(text) to anon, authenticated;

-- The public sign-up. Checks the form is open, every agreement is ticked, and the basics are there.
-- Signing up twice (same name and date of birth) updates the first sign-up.
create or replace function public.submit_trial_eoi(p_slug text, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.trials; a text; v_dob date; nm text; aid uuid; n int; ag jsonb := '{}'::jsonb;
begin
  select * into t from public.trials where slug = lower(trim(p_slug));
  if not found then raise exception 'This trial sign-up link is not valid.'; end if;
  if t.status <> 'open' or (t.closes_on is not null and t.closes_on < (now() at time zone 'Australia/Sydney')::date) then
    raise exception 'Sign-ups for these trials have closed.';
  end if;
  nm := regexp_replace(trim(coalesce(p->>'full_name', '')), '\s+', ' ', 'g');
  if char_length(nm) < 3 or nm !~ ' ' then raise exception 'Please enter the player''s first and last name.'; end if;
  begin v_dob := (p->>'dob')::date; exception when others then v_dob := null; end;
  if v_dob is null or v_dob > current_date or v_dob < current_date - interval '60 years' then raise exception 'Please enter the player''s date of birth.'; end if;
  if char_length(trim(coalesce(p->>'parent_name', ''))) < 2 then raise exception 'Please enter a parent or guardian''s name.'; end if;
  if coalesce(p->>'parent_email', '') !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Please enter a valid email address for the parent or guardian.'; end if;
  if char_length(regexp_replace(coalesce(p->>'parent_phone', ''), '\D', '', 'g')) < 8 then raise exception 'Please enter a parent or guardian''s mobile number.'; end if;
  foreach a in array t.agreements loop
    if coalesce((p->'agreed'->>a)::boolean, false) is not true then raise exception 'Please tick every box at the end of the form.'; end if;
    ag := ag || jsonb_build_object(a, true);
  end loop;
  select count(*) into n from public.trial_applicants where trial_id = t.id;
  if n >= 400 then raise exception 'This trial is full. Please contact the club.'; end if;

  insert into public.trial_applicants (trial_id, team_id, club_id, full_name, dob, current_club, positions, parent_name, parent_phone, parent_email, player_phone, player_email, agreed, source)
  values (t.id, t.team_id, t.club_id, left(nm, 80), v_dob, left(trim(coalesce(p->>'current_club', '')), 80), left(trim(coalesce(p->>'positions', '')), 120),
    left(trim(p->>'parent_name'), 80), left(trim(p->>'parent_phone'), 30), left(lower(trim(p->>'parent_email')), 120),
    case when t.ask_player_contact then left(trim(coalesce(p->>'player_phone', '')), 30) else '' end,
    case when t.ask_player_contact and coalesce(p->>'player_email', '') ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then left(lower(trim(p->>'player_email')), 120) else '' end,
    ag, 'form')
  on conflict (trial_id, name_key, dob) do update set
    current_club = excluded.current_club, positions = excluded.positions, parent_name = excluded.parent_name,
    parent_phone = excluded.parent_phone, parent_email = excluded.parent_email, player_phone = excluded.player_phone,
    player_email = excluded.player_email, agreed = excluded.agreed, submitted_at = now()
  returning id into aid;

  select count(*) into n from public.trial_applicants where trial_id = t.id;
  perform public.notify_trial_staff(t.id, 'Trial sign-up: ' || nm, n || ' signed up for ' || t.title || ' so far.', 'trial:' || t.id);
  return jsonb_build_object('id', aid);
end $$;
revoke all on function public.submit_trial_eoi(text, jsonb) from public;
grant execute on function public.submit_trial_eoi(text, jsonb) to anon, authenticated;

-- What the offer page shows the family (just enough to answer).
create or replace function public.trial_offer_public(p_token uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'player', split_part(a.full_name, ' ', 1), 'status', a.status, 'invite_code', case when a.status = 'accepted' then a.invite_code end,
    'team', tm.name, 'trial', t.title,
    'club', jsonb_build_object('name', c.name, 'logo', c.logo_url, 'primary', c.brand_primary, 'accent', c.brand_accent)
  )
  from public.trial_applicants a join public.trials t on t.id = a.trial_id join public.teams tm on tm.id = a.team_id join public.clubs c on c.id = a.club_id
  where a.offer_token = p_token and a.status in ('offered', 'accepted', 'declined')
$$;
grant execute on function public.trial_offer_public(uuid) to anon, authenticated;

-- The family accepts or declines. Accepting adds the player to the team and makes an invite
-- so the family can join the club on Overlap, already linked to their player.
create or replace function public.respond_trial_offer(p_token uuid, p_accept boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a public.trial_applicants; pid uuid; code text; pos text; tname text; ttitle text;
begin
  select * into a from public.trial_applicants where offer_token = p_token for update;
  if not found or a.status not in ('offered', 'accepted', 'declined') then raise exception 'This offer link is not valid.'; end if;
  select tm.name, t.title into tname, ttitle from public.trials t join public.teams tm on tm.id = t.team_id where t.id = a.trial_id;
  if a.status = 'accepted' then
    return jsonb_build_object('status', 'accepted', 'invite_code', a.invite_code, 'parent_email', a.parent_email, 'parent_name', a.parent_name,
      'player', a.full_name, 'player_email', a.player_email, 'club_id', a.club_id, 'team', tname, 'already', true);
  end if;
  if a.status = 'declined' and p_accept then raise exception 'This offer was declined. Please contact the club if that was a mistake.'; end if;
  if not p_accept then
    update public.trial_applicants set status = 'declined', responded_at = now() where id = a.id;
    perform public.notify_trial_staff(a.trial_id, a.full_name || ' declined', 'Their family declined the offer for ' || tname || '.', 'trialoffer:' || a.id);
    return jsonb_build_object('status', 'declined');
  end if;

  -- Their first-listed position decides where they start in the squad.
  pos := lower(trim(split_part(regexp_replace(a.positions, '[/;&|]|\mand\M|\mor\M', ',', 'g'), ',', 1)));
  pos := case
    when pos ~ '(goal|keeper|gk)' then 'GK'
    when pos ~ '(def|back|\mcb\M|\mlb\M|\mrb\M|sweeper)' then 'DEF'
    when pos ~ '(strik|forward|wing|attack|\mfwd\M|\mcf\M|\mst\M)' then 'FWD'
    else 'MID' end;
  insert into public.players (club_id, team_id, full_name, position, birth_year)
  values (a.club_id, a.team_id, a.full_name, pos::public.player_position, extract(year from a.dob)::int)
  returning id into pid;
  insert into public.invites (club_id, role, team_id, player_id, created_by, max_uses, expires_at)
  values (a.club_id, 'parent', a.team_id, pid, (select created_by from public.trials where id = a.trial_id), 2, now() + interval '60 days')
  returning invites.code into code;
  update public.trial_applicants set status = 'accepted', responded_at = now(), player_id = pid, invite_code = code where id = a.id;
  perform public.notify_trial_staff(a.trial_id, a.full_name || ' accepted', 'Added to ' || tname || '. Their family has been sent an invite.', 'trialoffer:' || a.id);
  return jsonb_build_object('status', 'accepted', 'invite_code', code, 'parent_email', a.parent_email, 'parent_name', a.parent_name,
    'player', a.full_name, 'player_email', a.player_email, 'club_id', a.club_id, 'team', tname, 'already', false);
end $$;
revoke all on function public.respond_trial_offer(uuid, boolean) from public;
grant execute on function public.respond_trial_offer(uuid, boolean) to anon, authenticated;

notify pgrst, 'reload schema';
