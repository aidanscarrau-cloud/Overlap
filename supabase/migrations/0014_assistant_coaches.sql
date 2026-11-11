-- Overlap: head coaches and assistant coaches.
-- "Coach" becomes "Head coach" (no data changes). A new "Assistant coach" role helps run the teams
-- they're added to, with fewer permissions switched on by default. Admins can change any switch.
-- Head coaches can invite assistant coaches to their own teams.
-- Safe to run more than once.

alter type public.member_role add value if not exists 'assistant';
-- (The new role is compared as text below, so this whole file can run in one go.)

-- What each role may do when the club hasn't changed the switch. Must match lib/permissions.ts.
create or replace function public.default_perm(r public.member_role, p text) returns boolean
language sql immutable set search_path = '' as $$
  select case
    when r::text = 'admin' then true
    when r::text = 'coach' then p <> 'teams.view_all'
    when r::text = 'assistant' then p in (
      'squad.view_notes', 'sessions.edit', 'sessions.view_notes', 'attendance.edit', 'attendance.view',
      'drills.edit', 'members.view', 'idp.view')
    else false
  end
$$;

-- Staff = admins, head coaches and assistant coaches.
create or replace function public.is_staff(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships where club_id = c and user_id = auth.uid() and role::text in ('admin', 'coach', 'assistant'))
$$;

-- Which invites someone may create, see and cancel.
-- Admins: anything. With "Invite players and parents": players and parents for their own teams.
-- Head coaches with that switch can also invite assistant coaches to their own teams.
create or replace function public.can_invite(c uuid, r public.member_role, t uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin(c) or (
    public.has_perm(c, 'invites.create') and t is not null and public.can_manage_team(t)
    and (
      r::text in ('player', 'parent')
      or (r::text = 'assistant' and exists (
        select 1 from public.memberships m where m.club_id = c and m.user_id = auth.uid() and m.role::text = 'coach'))
    )
  )
$$;

drop policy if exists invites_read on public.invites;
drop policy if exists invites_insert on public.invites;
drop policy if exists invites_delete on public.invites;
create policy invites_read on public.invites for select to authenticated using (public.can_invite(club_id, role, team_id));
create policy invites_insert on public.invites for insert to authenticated with check (public.can_invite(club_id, role, team_id));
create policy invites_delete on public.invites for delete to authenticated using (public.can_invite(club_id, role, team_id));

notify pgrst, 'reload schema';
