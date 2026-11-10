-- Overlap: fix deleting a team (or player) that is linked to a member or invite
-- The link check ran again while the database was clearing those links after a delete,
-- and failed with "Player is not in this club". It now only checks links that are
-- being set or changed to a new value.

create or replace function public.check_membership_links() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.team_id is not null
     and (tg_op = 'INSERT' or new.team_id is distinct from old.team_id)
     and not exists (select 1 from public.teams where id = new.team_id and club_id = new.club_id) then
    raise exception 'Team is not in this club';
  end if;
  if new.player_id is not null
     and (tg_op = 'INSERT' or new.player_id is distinct from old.player_id)
     and not exists (select 1 from public.players where id = new.player_id and club_id = new.club_id) then
    raise exception 'Player is not in this club';
  end if;
  return new;
end $$;
