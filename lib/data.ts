import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { permsFor, type RolePerm } from "@/lib/permissions";
import type { Evaluation, Goal, GoalUpdate } from "@/lib/idp";
import type { AppNotification, Match, MatchPlayer, MatchReply, NotificationPrefs, Announcement, Attendance, Club, ClubData, Drill, Member, Player, PlayerLoad, Reply, Role, Session, Team } from "@/lib/types";

type MemRow = { id: string; club_id: string; user_id: string; role: Role; clubs: Club | Club[] | null };
type MemberRow = { id: string; user_id: string; role: Role; profiles: { full_name: string } | { full_name: string }[] | null };
type DB = Awaited<ReturnType<typeof createClient>>;
/** Sessions, with their series id once update 0015 is in (works without it too). */
async function loadSessions(supabase: DB, clubId: string) {
  const cols = "id,club_id,team_id,date,start_time,location,title,focus,plan";
  const res = await supabase.from("sessions").select(cols + ",series_id").eq("club_id", clubId).order("date").order("start_time");
  if (!res.error || !/series_id/.test(res.error.message)) return res;
  return supabase.from("sessions").select(cols).eq("club_id", clubId).order("date").order("start_time");
}

const DEFAULT_PREFS: NotificationPrefs = { sessions: true, announcements: true, reminders: true, development: true, email: "always" };
const one = <T,>(x: T | T[] | null): T | null => (Array.isArray(x) ? (x[0] ?? null) : x);

/** Everything the signed-in person may see in their current club. The database's rules decide what that is. */
export async function getClubData(): Promise<ClubData> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const claims = auth?.claims;
  if (!claims?.sub) redirect("/login");
  const user = { id: claims.sub as string, email: (claims.email as string | undefined) ?? "" };

  const jar = await cookies();
  const wanted = jar.get("overlap-club")?.value;

  const memsQuery = supabase
    .from("memberships")
    .select("id,club_id,user_id,role,clubs(id,name,logo_url)")
    .eq("user_id", user.id)
    .order("created_at");

  // Everything for one club, fetched in parallel. Row level security limits what comes back.
  const loadClub = (clubId: string) =>
    Promise.all([
      supabase.from("teams").select("id,club_id,name,age_group,coach_name,logo_url").eq("club_id", clubId).order("created_at"),
      supabase.from("players").select("id,club_id,team_id,full_name,shirt_number,position,status").eq("club_id", clubId).order("shirt_number"),
      supabase.from("drills").select("id,club_id,name,category,minutes,player_count,area,description,points,diagram").eq("club_id", clubId).order("created_at"),
      loadSessions(supabase, clubId),
      supabase.from("attendance").select("session_id,player_id").eq("club_id", clubId),
      supabase.from("memberships").select("id,user_id,role,profiles(full_name)").eq("club_id", clubId).order("created_at"),
      supabase.from("member_teams").select("membership_id,team_id").eq("club_id", clubId),
      supabase.from("member_players").select("membership_id,player_id").eq("club_id", clubId),
      supabase.from("player_teams").select("player_id,team_id").eq("club_id", clubId),
      supabase.from("role_permissions").select("role,perm,allowed").eq("club_id", clubId),
      supabase.rpc("get_player_notes", { c: clubId }),
      supabase.rpc("get_session_notes", { c: clubId }),
      supabase.from("announcements").select("id,team_id,title,body,pinned,author_id,author_name,created_at").eq("club_id", clubId).order("pinned", { ascending: false }).order("created_at", { ascending: false }).limit(100),
      supabase.from("session_replies").select("session_id,player_id,going,note,updated_at").eq("club_id", clubId),
      supabase.rpc("get_player_loads", { c: clubId }),
      supabase.from("player_evaluations").select("id,player_id,evaluated_on,ratings,comments,strengths,improvements,summary,shared,author_name,created_at").eq("club_id", clubId).order("evaluated_on", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("player_goals").select("id,player_id,area,title,detail,target_date,status,progress,achieved_on,author_name,created_at,updated_at").eq("club_id", clubId).order("created_at"),
      supabase.from("goal_updates").select("id,goal_id,note,progress,by_staff,author_id,author_name,created_at").eq("club_id", clubId).order("created_at"),
      supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
      supabase.from("notifications").select("id,club_id,kind,title,body,url,created_at,read_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(40),
      supabase.from("notification_prefs").select("sessions,announcements,reminders,development,email").eq("user_id", user.id).maybeSingle(),
      supabase
        .from("matches")
        .select("id,club_id,team_id,date,kickoff,meet_time,opponent,home_away,venue,competition,round,format,length_mins,status,our_score,their_score,formation,squad_published,report,external_ref,updated_at")
        .eq("club_id", clubId)
        .order("date")
        .order("kickoff"),
      supabase.from("match_players").select("match_id,player_id,role,slot,minutes,goals,assists,yellow,red").eq("club_id", clubId),
      supabase.from("match_replies").select("match_id,player_id,going,note,updated_at").eq("club_id", clubId),
    ]);

  // If we already know which club to show, load it at the same time as the memberships.
  const [memsRes, guessed] = await Promise.all([memsQuery, wanted ? loadClub(wanted) : Promise.resolve(null)]);
  if (memsRes.error) throw memsRes.error;
  const mems = (memsRes.data ?? []) as unknown as MemRow[];
  if (!mems.length) redirect("/onboarding");
  const mine = mems.find((m) => m.club_id === wanted) ?? mems[0];
  const clubId = mine.club_id;

  const [teams, players, drills, sessions, attendance, members, memberTeams, memberPlayers, playerTeams, rolePerms, playerNotes, sessionNotes, announcements, replies, loads, evaluations, goals, goalUpdates, profile, inbox, prefs, matches, matchPlayers, matchReplies] =
    guessed && mine.club_id === wanted ? guessed : await loadClub(clubId);
  for (const r of [teams, players, drills, sessions, attendance, members, memberTeams, memberPlayers, playerTeams, rolePerms, playerNotes, sessionNotes, announcements, replies, loads, evaluations, goals, goalUpdates]) if (r.error) throw r.error;

  const teamsByMember = new Map<string, string[]>();
  ((memberTeams.data ?? []) as { membership_id: string; team_id: string }[]).forEach((r) => {
    teamsByMember.set(r.membership_id, [...(teamsByMember.get(r.membership_id) ?? []), r.team_id]);
  });
  const playersByMember = new Map<string, string[]>();
  ((memberPlayers.data ?? []) as { membership_id: string; player_id: string }[]).forEach((r) => {
    playersByMember.set(r.membership_id, [...(playersByMember.get(r.membership_id) ?? []), r.player_id]);
  });
  const memberList: Member[] = ((members.data ?? []) as unknown as MemberRow[]).map((m) => ({
    id: m.id,
    user_id: m.user_id,
    role: m.role,
    team_ids: teamsByMember.get(m.id) ?? [],
    player_ids: playersByMember.get(m.id) ?? [],
    full_name: one(m.profiles)?.full_name || "Unnamed member",
  }));

  const notes = new Map(((playerNotes.data ?? []) as { player_id: string; status_note: string }[]).map((n) => [n.player_id, n.status_note]));
  const sNotes = new Map(((sessionNotes.data ?? []) as { session_id: string; notes: string }[]).map((n) => [n.session_id, n.notes]));
  const extraTeams = new Map<string, string[]>();
  ((playerTeams.data ?? []) as { player_id: string; team_id: string }[]).forEach((r) => {
    extraTeams.set(r.player_id, [...(extraTeams.get(r.player_id) ?? []), r.team_id]);
  });
  const playerList: Player[] = ((players.data ?? []) as Omit<Player, "status_note" | "team_ids">[]).map((p) => ({
    ...p,
    team_ids: [p.team_id, ...(extraTeams.get(p.id) ?? []).filter((t) => t !== p.team_id)],
    status_note: notes.get(p.id) ?? "",
  }));
  const teamList = (teams.data ?? []) as Team[];
  const rp = (rolePerms.data ?? []) as RolePerm[];

  const me = memberList.find((m) => m.user_id === user.id) ?? {
    id: mine.id,
    user_id: user.id,
    role: mine.role,
    team_ids: teamsByMember.get(mine.id) ?? [],
    player_ids: playersByMember.get(mine.id) ?? [],
    full_name: profile.data?.full_name || "You",
  };
  const linkedTeams = playerList.filter((p) => me.player_ids.includes(p.id)).flatMap((p) => p.team_ids);
  const myTeamIds = mine.role === "admin" ? teamList.map((t) => t.id) : [...new Set([...me.team_ids, ...linkedTeams])];

  return {
    userId: user.id,
    myName: profile.data?.full_name || user.email || "You",
    myEmail: user.email,
    club: one(mine.clubs) ?? { id: clubId, name: "Your club", logo_url: null },
    clubs: mems.map((m) => one(m.clubs)).filter(Boolean) as Club[],
    role: mine.role,
    me,
    perms: permsFor(mine.role, rp),
    rolePerms: rp,
    myTeamIds,
    teams: teamList,
    players: playerList,
    drills: (drills.data ?? []) as Drill[],
    sessions: ((sessions.data ?? []) as Omit<Session, "notes">[]).map((s) => ({ ...s, series_id: s.series_id ?? null, notes: sNotes.get(s.id) ?? "", plan: Array.isArray(s.plan) ? s.plan : [] })),
    attendance: (attendance.data ?? []) as Attendance[],
    announcements: (announcements.data ?? []) as Announcement[],
    replies: (replies.data ?? []) as Reply[],
    loads: (loads.data ?? []) as PlayerLoad[],
    evaluations: (evaluations.data ?? []) as Evaluation[],
    goals: (goals.data ?? []) as Goal[],
    goalUpdates: (goalUpdates.data ?? []) as GoalUpdate[],
    members: memberList,
    // If the notifications tables aren't there yet, the rest of the app still works.
    notifications: inbox.error ? [] : ((inbox.data ?? []) as AppNotification[]),
    notificationPrefs: (prefs.data as NotificationPrefs | null) ?? DEFAULT_PREFS,
    // Before update 0017 these tables don't exist; the rest of the app keeps working.
    matches: matches.error ? [] : ((matches.data ?? []) as Match[]),
    matchPlayers: matchPlayers.error ? [] : ((matchPlayers.data ?? []) as MatchPlayer[]),
    matchReplies: matchReplies.error ? [] : ((matchReplies.data ?? []) as MatchReply[]),
  };
}
