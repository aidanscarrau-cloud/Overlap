import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { permsFor, type RolePerm } from "@/lib/permissions";
import type { Attendance, Club, ClubData, Drill, Member, Player, Role, Session, Team } from "@/lib/types";

type MemRow = { id: string; club_id: string; user_id: string; role: Role; player_id: string | null; clubs: Club | Club[] | null };
type MemberRow = { id: string; user_id: string; role: Role; player_id: string | null; profiles: { full_name: string } | { full_name: string }[] | null };
const one = <T,>(x: T | T[] | null): T | null => (Array.isArray(x) ? (x[0] ?? null) : x);

/** Everything the signed-in person may see in their current club. The database's rules decide what that is. */
export async function getClubData(): Promise<ClubData> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memsRaw, error } = await supabase
    .from("memberships")
    .select("id,club_id,user_id,role,player_id,clubs(id,name,logo_url)")
    .eq("user_id", user.id)
    .order("created_at");
  if (error) throw error;
  const mems = (memsRaw ?? []) as unknown as MemRow[];
  if (!mems.length) redirect("/onboarding");

  const jar = await cookies();
  const wanted = jar.get("overlap-club")?.value;
  const mine = mems.find((m) => m.club_id === wanted) ?? mems[0];
  const clubId = mine.club_id;

  const [teams, players, drills, sessions, attendance, members, memberTeams, rolePerms, playerNotes, sessionNotes, profile] = await Promise.all([
    supabase.from("teams").select("id,club_id,name,age_group,coach_name,logo_url").eq("club_id", clubId).order("created_at"),
    supabase.from("players").select("id,club_id,team_id,full_name,shirt_number,position,status").eq("club_id", clubId).order("shirt_number"),
    supabase.from("drills").select("id,club_id,name,category,minutes,player_count,area,description,points,diagram").eq("club_id", clubId).order("created_at"),
    supabase.from("sessions").select("id,club_id,team_id,date,start_time,location,title,focus,plan").eq("club_id", clubId).order("date").order("start_time"),
    supabase.from("attendance").select("session_id,player_id").eq("club_id", clubId),
    supabase.from("memberships").select("id,user_id,role,player_id,profiles(full_name)").eq("club_id", clubId).order("created_at"),
    supabase.from("member_teams").select("membership_id,team_id").eq("club_id", clubId),
    supabase.from("role_permissions").select("role,perm,allowed").eq("club_id", clubId),
    supabase.rpc("get_player_notes", { c: clubId }),
    supabase.rpc("get_session_notes", { c: clubId }),
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
  ]);
  for (const r of [teams, players, drills, sessions, attendance, members, memberTeams, rolePerms, playerNotes, sessionNotes]) if (r.error) throw r.error;

  const teamsByMember = new Map<string, string[]>();
  ((memberTeams.data ?? []) as { membership_id: string; team_id: string }[]).forEach((r) => {
    teamsByMember.set(r.membership_id, [...(teamsByMember.get(r.membership_id) ?? []), r.team_id]);
  });
  const memberList: Member[] = ((members.data ?? []) as unknown as MemberRow[]).map((m) => ({
    id: m.id,
    user_id: m.user_id,
    role: m.role,
    team_ids: teamsByMember.get(m.id) ?? [],
    player_id: m.player_id,
    full_name: one(m.profiles)?.full_name || "Unnamed member",
  }));

  const notes = new Map(((playerNotes.data ?? []) as { player_id: string; status_note: string }[]).map((n) => [n.player_id, n.status_note]));
  const sNotes = new Map(((sessionNotes.data ?? []) as { session_id: string; notes: string }[]).map((n) => [n.session_id, n.notes]));
  const playerList = ((players.data ?? []) as Omit<Player, "status_note">[]).map((p) => ({ ...p, status_note: notes.get(p.id) ?? "" }));
  const teamList = (teams.data ?? []) as Team[];
  const rp = (rolePerms.data ?? []) as RolePerm[];

  const me = memberList.find((m) => m.user_id === user.id) ?? {
    id: mine.id,
    user_id: user.id,
    role: mine.role,
    team_ids: teamsByMember.get(mine.id) ?? [],
    player_id: mine.player_id,
    full_name: profile.data?.full_name || "You",
  };
  const linkedTeam = me.player_id ? playerList.find((p) => p.id === me.player_id)?.team_id : undefined;
  const myTeamIds = mine.role === "admin" ? teamList.map((t) => t.id) : [...new Set([...me.team_ids, ...(linkedTeam ? [linkedTeam] : [])])];

  return {
    userId: user.id,
    myName: profile.data?.full_name || user.email || "You",
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
    sessions: ((sessions.data ?? []) as Omit<Session, "notes">[]).map((s) => ({ ...s, notes: sNotes.get(s.id) ?? "", plan: Array.isArray(s.plan) ? s.plan : [] })),
    attendance: (attendance.data ?? []) as Attendance[],
    members: memberList,
  };
}
