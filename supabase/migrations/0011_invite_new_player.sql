-- Overlap: invites that add a new player to the squad when someone joins
-- Fixes: inviting a player or parent to a brand-new team (no players yet) left them unlinked,
-- so they couldn't reply to sessions. Safe to run more than once.

alter table public.invites add column if not exists create_player boolean not null default false;
alter table public.invites add column if not exists new_player_name text;

alter table public.invites drop constraint if exists invites_new_player_check;
alter table public.invites add constraint invites_new_player_check check (
  not create_player or (
    role in ('player', 'parent')
    and team_id is not null
    and player_id is null
    -- a parent invite names the child, and is single-use so the child isn't added twice
    and (role = 'player' or (new_player_name is not null and char_length(trim(new_player_name)) between 1 and 80 and max_uses = 1))
  )
);

create or replace function public.join_club(invite_code text, your_name text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare inv public.invites; mid uuid; mrole public.member_role; pid uuid; pname text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into inv from public.invites where code = upper(trim(invite_code)) for update;
  if not found then raise exception 'That invite code does not exist. Check it and try again.'; end if;
  if inv.expires_at < now() then raise exception 'That invite code has expired. Ask your club for a new one.'; end if;
  if inv.uses >= inv.max_uses then raise exception 'That invite code has already been used. Ask your club for a new one.'; end if;

  select id, role into mid, mrole from public.memberships where club_id = inv.club_id and user_id = auth.uid();
  if mid is not null then
    -- Already in the club: a player or parent can use another player's invite to add that player.
    if (inv.player_id is null and not inv.create_player) or mrole not in ('player', 'parent') then
      raise exception 'You are already a member of this club.';
    end if;
    if inv.player_id is not null and exists (select 1 from public.member_players where membership_id = mid and player_id = inv.player_id) then
      raise exception 'That player is already linked to your account.';
    end if;
  else
    insert into public.profiles (id, full_name) values (auth.uid(), left(coalesce(your_name, ''), 80))
      on conflict (id) do update set full_name = case when excluded.full_name <> '' then excluded.full_name else public.profiles.full_name end;
    insert into public.memberships (club_id, user_id, role) values (inv.club_id, auth.uid(), inv.role) returning id into mid;
  end if;

  pid := inv.player_id;
  if pid is null and inv.create_player then
    -- A player is added under their own name; a parent's invite carries the child's name.
    pname := coalesce(
      nullif(trim(inv.new_player_name), ''),
      nullif(trim(your_name), ''),
      (select nullif(full_name, '') from public.profiles where id = auth.uid()),
      'New player'
    );
    insert into public.players (club_id, team_id, full_name) values (inv.club_id, inv.team_id, left(pname, 80)) returning id into pid;
  end if;

  if pid is not null then
    insert into public.member_players (membership_id, player_id, club_id) values (mid, pid, inv.club_id) on conflict do nothing;
  end if;
  if inv.team_id is not null then
    insert into public.member_teams (membership_id, team_id, club_id) values (mid, inv.team_id, inv.club_id) on conflict do nothing;
  end if;
  update public.invites set uses = uses + 1 where code = inv.code;
  return inv.club_id;
end $$;

-- Tell the API about the new columns straight away.
notify pgrst, 'reload schema';
