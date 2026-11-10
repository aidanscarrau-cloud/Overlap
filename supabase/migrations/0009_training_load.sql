-- Overlap: training load per player, across every team they train with
-- Returns totals only (minutes and session counts), so a coach can see a player's full
-- load even when part of it comes from a team that coach can't see. Safe to run again.

create or replace function public.session_minutes(plan jsonb) returns int
language sql immutable set search_path = '' as $$
  select coalesce(sum(greatest(0, least(180, coalesce((x ->> 'mins')::int, 0)))), 0)::int
  from jsonb_array_elements(case when jsonb_typeof(plan) = 'array' then plan else '[]'::jsonb end) x
$$;

create or replace function public.get_player_loads(c uuid)
returns table (
  player_id uuid,
  mins_7d int,         -- minutes attended in the last 7 days (today included)
  sessions_7d int,
  teams_7d int,        -- how many different teams those sessions were with
  mins_28d int,        -- minutes attended in the last 28 days
  sessions_28d int,
  planned_mins_7d int, -- minutes of sessions in the next 7 days they haven't said No to
  planned_sessions_7d int
)
language sql stable security definer set search_path = '' as $$
  with vis as (
    -- Players you can see, and whose attendance you may see (or your own / your children).
    select p.id, p.team_id from public.players p
    where p.club_id = c
      and public.can_view_player(p.id, p.team_id)
      and (public.has_perm(c, 'attendance.view') or public.is_linked_player(p.id))
  ),
  teams_of as (
    select id as player_id, team_id from vis
    union
    select pt.player_id, pt.team_id from public.player_teams pt join vis on vis.id = pt.player_id
  ),
  att as (
    select a.player_id, s.date, s.team_id, public.session_minutes(s.plan) as m
    from public.attendance a
    join public.sessions s on s.id = a.session_id
    join vis on vis.id = a.player_id
    where s.date between current_date - 27 and current_date
  ),
  planned as (
    select t.player_id, public.session_minutes(s.plan) as m
    from teams_of t
    join public.sessions s on s.team_id = t.team_id
    where s.date between current_date and current_date + 6
      and not exists (
        select 1 from public.session_replies r where r.session_id = s.id and r.player_id = t.player_id and not r.going
      )
      -- today's sessions already marked as attended are counted in att, not here
      and not exists (select 1 from public.attendance a where a.session_id = s.id and a.player_id = t.player_id)
  )
  select
    v.id,
    coalesce((select sum(m) from att where att.player_id = v.id and att.date >= current_date - 6), 0)::int,
    (select count(*) from att where att.player_id = v.id and att.date >= current_date - 6)::int,
    (select count(distinct team_id) from att where att.player_id = v.id and att.date >= current_date - 6)::int,
    coalesce((select sum(m) from att where att.player_id = v.id), 0)::int,
    (select count(*) from att where att.player_id = v.id)::int,
    coalesce((select sum(m) from planned where planned.player_id = v.id), 0)::int,
    (select count(*) from planned where planned.player_id = v.id)::int
  from vis v
$$;

revoke execute on function public.get_player_loads(uuid) from public, anon;
grant execute on function public.get_player_loads(uuid) to authenticated;
