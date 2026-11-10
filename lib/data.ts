import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Attendance, Club, ClubData, Drill, Member, Player, Role, Session, Team } from "@/lib/types";

type MemRow = { id: string; club_id: string; user_id: string; role: Role; team_id: string | null; player_id: string | null; clubs: Club | Club[] | null };
type MemberRow = { id: string; user_id: string; role: Role; team_id: string | null; player_id: string | null; profiles: { full_name: string } | { full_name: string }[] | null };
const one = <T,>(x: T | T[] | null): T | null => (Array.isArray(x) ? (x[0] ?? null) : x);

/** Everything the signed-in person can see in their current club. Row level security limits it server-side. */
export async function getClubData(): Promise<ClubData> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memsRaw, error } = await supabase
    .from("memberships")
    .select("id,club_id,user_id,role,team_id,player_id,clubs(id,name,logo_url)")
    .eq("user_id", user.id)
    .order("created_at");
  if (error) throw error;
  const mems = (memsRaw ?? []) as unknown as MemRow[];
  if (!mems.length) redirect("/onboarding");

  const jar = await cookies();
  const wanted = jar.get("overlap-club")?.value;
  const mine = mems.find((m) => m.club_id === wanted) ?? mems[0];
  const clubId = mine.club_id;

  const [teams, players, drills, sessions, attendance, members, profile] = await Promise.all([
    supabase.from("teams").select("id,club_id,name,age_group,coach_name,logo_url").eq("club_id", clubId).order("created_at"),
    supabase.from("players").select("id,club_id,team_id,full_name,shirt_number,position,status,status_note").eq("club_id", clubId).order("shirt_number"),
    supabase.from("drills").select("id,club_id,name,category,minutes,player_count,area,description,points,diagram").eq("club_id", clubId).order("created_at"),
    supabase.from("sessions").select("id,club_id,team_id,date,start_time,location,title,focus,notes,plan").eq("club_id", clubId).order("date").order("start_time"),
    supabase.from("attendance").select("session_id,player_id").eq("club_id", clubId),
    supabase.from("memberships").select("id,user_id,role,team_id,player_id,profiles(full_name)").eq("club_id", clubId).order("created_at"),
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
  ]);
  for (const r of [teams, players, drills, sessions, attendance, members]) if (r.error) throw r.error;

  const memberList: Member[] = ((members.data ?? []) as unknown as MemberRow[]).map((m) => ({
    id: m.id,
    user_id: m.user_id,
    role: m.role,
    team_id: m.team_id,
    player_id: m.player_id,
    full_name: one(m.profiles)?.full_name || "Unnamed member",
  }));

  return {
    userId: user.id,
    myName: profile.data?.full_name || user.email || "You",
    club: one(mine.clubs) ?? { id: clubId, name: "Your club", logo_url: null },
    clubs: mems.map((m) => one(m.clubs)).filter(Boolean) as Club[],
    role: mine.role,
    me: memberList.find((m) => m.user_id === user.id)!,
    teams: (teams.data ?? []) as Team[],
    players: (players.data ?? []) as Player[],
    drills: (drills.data ?? []) as Drill[],
    sessions: ((sessions.data ?? []) as Session[]).map((s) => ({ ...s, plan: Array.isArray(s.plan) ? s.plan : [] })),
    attendance: (attendance.data ?? []) as Attendance[],
    members: memberList,
  };
}
