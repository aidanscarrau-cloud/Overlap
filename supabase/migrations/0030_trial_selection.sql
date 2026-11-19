-- Overlap: better trial selection. A squad size and per-position targets for each trial, and a
-- position for each triallist (guessed from their form, changeable by coaches). Accepting an offer
-- uses that position for the new player. Safe to run more than once.

alter table public.trials add column if not exists squad_target int check (squad_target between 1 and 40);
alter table public.trials add column if not exists position_targets jsonb not null default '{}';
alter table public.trial_applicants add column if not exists position text check (position in ('GK', 'DEF', 'MID', 'FWD'));

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
  pos := case when a.position is not null then a.position else null end;
  if pos is null then
  pos := lower(trim(split_part(regexp_replace(a.positions, '[/;&|]|\mand\M|\mor\M', ',', 'g'), ',', 1)));
  pos := case
    when pos ~ '(goal|keeper|gk)' then 'GK'
    when pos ~ '(def|back|\mcb\M|\mlb\M|\mrb\M|sweeper)' then 'DEF'
    when pos ~ '(strik|forward|wing|attack|\mfwd\M|\mcf\M|\mst\M)' then 'FWD'
    else 'MID' end;
  end if;
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
