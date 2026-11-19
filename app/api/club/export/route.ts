import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { toCsv, zip } from "@/lib/zip";

// Club admins download everything their club has in Overlap, as spreadsheets in one zip file.
// Runs as the signed-in admin, so the database's own access rules decide what's included.
const TABLES: [file: string, table: string, select?: string][] = [
  ["teams", "teams"],
  ["players", "players", "id,club_id,team_id,full_name,shirt_number,position,status,birth_year"],
  ["player_teams", "player_teams"],
  ["members", "memberships", "id,user_id,role,created_at,profiles(full_name)"],
  ["member_teams", "member_teams"],
  ["member_players", "member_players"],
  ["sessions", "sessions", "id,club_id,team_id,date,start_time,location,title,focus,plan,series_id"],
  ["session_replies", "session_replies"],
  ["attendance", "attendance"],
  ["matches", "matches"],
  ["match_players", "match_players"],
  ["match_replies", "match_replies"],
  ["lineups", "team_lineups"],
  ["announcements", "announcements"],
  ["evaluations", "player_evaluations"],
  ["goals", "player_goals"],
  ["goal_updates", "goal_updates"],
  ["self_reviews", "self_reviews"],
  ["fitness_test_days", "fitness_test_days"],
  ["fitness_results", "fitness_results"],
  ["injuries", "player_injuries"],
  ["trials", "trials"],
  ["trial_dates", "trial_dates"],
  ["trial_applicants", "trial_applicants"],
  ["trial_ratings", "trial_ratings"],
  ["drills", "drills"],
];

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const wanted = request.cookies.get("overlap-club")?.value;
  const { data: mems } = await supabase.from("memberships").select("club_id,role,clubs(name)").eq("user_id", auth.user.id).eq("role", "admin");
  type M = { club_id: string; clubs: { name: string } | { name: string }[] | null };
  const list = (mems ?? []) as M[];
  const m = list.find((x) => x.club_id === wanted) ?? list[0];
  if (!m) return NextResponse.json({ error: "Only club admins can download the club's data." }, { status: 403 });
  const clubName = (Array.isArray(m.clubs) ? m.clubs[0]?.name : m.clubs?.name) ?? "club";

  const files: { name: string; data: string }[] = [];
  const counts: string[] = [];
  const skipped: string[] = [];
  for (const [file, table, select] of TABLES) {
    const { data, error } = await supabase.from(table).select(select ?? "*").eq("club_id", m.club_id).limit(50000);
    if (error) {
      // Parts that don't exist yet (an older database) are skipped; anything else is noted in the README.
      if (!/does not exist|schema cache/i.test(error.message)) skipped.push(`${file}: ${error.message}`);
      continue;
    }
    const rows = ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => {
      if (file === "members") {
        const p = r.profiles as { full_name?: string } | { full_name?: string }[] | null;
        const { profiles: _drop, ...rest } = r;
        void _drop;
        return { ...rest, full_name: (Array.isArray(p) ? p[0]?.full_name : p?.full_name) ?? "" };
      }
      if (file === "trial_applicants") {
        const { offer_token: _t, ...rest } = r;
        void _t;
        return rest;
      }
      return r;
    });
    files.push({ name: `${file}.csv`, data: toCsv(rows) });
    counts.push(`${file}.csv: ${rows.length} row${rows.length === 1 ? "" : "s"}`);
  }
  const today = new Date().toISOString().slice(0, 10);
  files.unshift({
    name: "README.txt",
    data: [
      `${clubName}: Overlap data export, ${today}`,
      "",
      "Each file is a spreadsheet (CSV) that opens in Excel, Numbers or Google Sheets.",
      "Rows link to each other by their id columns (for example players.id = attendance.player_id).",
      "Private chat messages aren't included.",
      "",
      ...counts,
      ...(skipped.length ? ["", "Couldn't include:", ...skipped] : []),
    ].join("\r\n"),
  });
  const body = zip(files);
  const safe = clubName.replace(/[^\w -]+/g, "").trim().replace(/\s+/g, "-") || "club";
  return new NextResponse(body as unknown as BodyInit, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${safe}-overlap-export-${today}.zip"`,
      "cache-control": "no-store",
    },
  });
}
