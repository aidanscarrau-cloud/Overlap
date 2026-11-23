import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { aiConfigured, cleanReport, drillCatalogue, scrubNames, writeReports, type AiPlayer } from "@/lib/match-ai";

// Writing a squad's reports can take a minute or two.
export const maxDuration = 300;

/** Fair-use cap on AI reports per club per 30 days (about 2 matches a week for 8 teams). */
const MONTHLY_CAP = 1200;

type Body = { match_id?: string; player_ids?: string[]; replace_shared?: boolean };

// A coach asks for draft reports for a match they review. Everything is read as the signed-in coach,
// so the database decides what they can see; reports are saved as drafts for the coach to check.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }
  const matchId = String(body.match_id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(matchId)) return NextResponse.json({ ok: false, error: "Match not found." });
  if (!aiConfigured()) return NextResponse.json({ ok: false, error: "AI reports aren't set up on the server yet (the club's administrator needs to add the AI key)." });

  const { data: match } = await supabase
    .from("matches")
    .select("id,club_id,team_id,date,opponent,home_away,competition,our_score,their_score,length_mins,report,status")
    .eq("id", matchId)
    .maybeSingle();
  if (!match) return NextResponse.json({ ok: false, error: "Match not found." });
  const { data: editable } = await supabase.rpc("match_editable", { mid: matchId });
  if (!editable) return NextResponse.json({ ok: false, error: "Only this team's coaches can write match reports." });
  const { data: club } = await supabase.from("clubs").select("plan,ai_reports").eq("id", match.club_id).maybeSingle();
  if (club?.plan !== "pro") return NextResponse.json({ ok: false, error: "Match reviews are part of Overlap Pro." });
  if (!club?.ai_reports) return NextResponse.json({ ok: false, error: "AI feedback is switched off for your club. An admin can turn it on in the Review tab." });

  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const { count } = await supabase.from("match_reports").select("id", { count: "exact", head: true }).eq("club_id", match.club_id).eq("ai", true).gte("updated_at", since);

  const [{ data: squad }, { data: reviews }, { data: existing }, { data: team }, { data: drills }, { data: sessions }] = await Promise.all([
    supabase.from("match_players").select("player_id,role,minutes,goals,assists,yellow,red").eq("match_id", matchId),
    supabase.from("match_reviews").select("*").eq("match_id", matchId),
    supabase.from("match_reports").select("player_id,status").eq("match_id", matchId),
    supabase.from("teams").select("name,age_group").eq("id", match.team_id).maybeSingle(),
    supabase.from("drills").select("id,name,category,description").eq("club_id", match.club_id).order("name").limit(150),
    supabase.from("sessions").select("focus").eq("team_id", match.team_id).lte("date", match.date).order("date", { ascending: false }).limit(4),
  ]);
  const shared = new Set((existing ?? []).filter((r) => r.status === "shared").map((r) => r.player_id as string));
  const want = new Set((body.player_ids ?? []).filter((x) => typeof x === "string"));
  const rows = (squad ?? []).filter((r) => (want.size ? want.has(r.player_id) : true) && (body.replace_shared || !shared.has(r.player_id)));
  if (!rows.length) return NextResponse.json({ ok: false, error: want.size ? "Those players' reports are already shared." : "Pick the squad first, then log their stats." });
  if (rows.length > 30) return NextResponse.json({ ok: false, error: "That's more than 30 players. Write reports for fewer at a time." });
  if ((count ?? 0) + rows.length > MONTHLY_CAP) return NextResponse.json({ ok: false, error: "Your club has reached this month's fair-use limit for AI reports. Contact us if you need more." });

  const ids = rows.map((r) => r.player_id as string);
  const [{ data: players }, { data: goals }, { data: recent }] = await Promise.all([
    supabase.from("players").select("id,full_name,position").in("id", ids),
    supabase.from("player_goals").select("player_id,area,title").in("player_id", ids).eq("status", "active"),
    supabase.from("match_reports").select("player_id,work_on,updated_at").in("player_id", ids).neq("match_id", matchId).order("updated_at", { ascending: false }).limit(ids.length * 2),
  ]);
  const byId = new Map((players ?? []).map((p) => [p.id as string, p]));
  const labels = new Map(ids.map((id, i) => [id, `P${i + 1}`]));
  const names = ids.map((id) => ({ full: (byId.get(id)?.full_name as string) ?? "", label: labels.get(id)! })).filter((n) => n.full);
  const rev = new Map((reviews ?? []).map((r) => [r.player_id as string, r]));
  const scrub = (s: string) => scrubNames(s, names);

  const aiPlayers: AiPlayer[] = rows.map((r) => {
    const v = rev.get(r.player_id);
    return {
      label: labels.get(r.player_id)!,
      position: (byId.get(r.player_id)?.position as string) ?? "MID",
      role: r.role,
      minutes: r.minutes,
      goals: r.goals,
      assists: r.assists,
      yellow: r.yellow,
      red: r.red,
      rating: v?.rating ?? null,
      shots: v?.shots ?? 0,
      on_target: v?.on_target ?? 0,
      key_passes: v?.key_passes ?? 0,
      tackles: v?.tackles ?? 0,
      saves: v?.saves ?? 0,
      notes: scrub(v?.notes ?? ""),
      moments: ((v?.moments ?? []) as { t: string; note: string }[]).map((m) => ({ t: m.t, note: scrub(m.note) })),
      goals_now: (goals ?? []).filter((g) => g.player_id === r.player_id).map((g) => ({ area: g.area, title: scrub(g.title) })),
      recent: (recent ?? [])
        .filter((x) => x.player_id === r.player_id)
        .slice(0, 1)
        .flatMap((x) => ((x.work_on ?? []) as { title: string }[]).map((w) => w.title)),
    };
  });
  const catalogue = drillCatalogue((drills ?? []) as { id: string; name: string; category: string; description: string }[]);

  let out;
  try {
    out = await writeReports(
      {
        ageGroup: (team?.age_group as string) || (team?.name as string) || "",
        opponent: match.opponent,
        homeAway: match.home_away,
        competition: match.competition,
        ourScore: match.our_score,
        theirScore: match.their_score,
        lengthMins: match.length_mins,
        teamReport: scrub(match.report ?? "").slice(0, 2000),
        focus: [...new Set((sessions ?? []).map((s) => (s.focus as string).trim()).filter(Boolean))].join("; ").slice(0, 300),
      },
      aiPlayers,
      catalogue,
    );
  } catch (e) {
    console.error("match reports:", e);
    const msg =
      e instanceof Anthropic.RateLimitError
        ? "The AI is busy right now. Try again in a minute."
        : e instanceof Anthropic.AuthenticationError
          ? "The server's AI key isn't working. Check ANTHROPIC_API_KEY."
          : e instanceof Anthropic.APIError
            ? "The AI service had a problem. Try again in a minute."
            : e instanceof Error
              ? e.message
              : "Couldn't write the reports.";
    return NextResponse.json({ ok: false, error: msg });
  }

  const byLabel = new Map([...labels].map(([id, l]) => [l, id]));
  const author = (auth.user.user_metadata?.full_name as string | undefined) ?? "";
  const save = out
    .filter((r) => byLabel.has(r.player))
    .map((r) => {
      const c = cleanReport(r, catalogue);
      const first = (byId.get(byLabel.get(r.player)!)?.full_name as string | undefined)?.split(" ")[0] ?? "";
      // Put the player's name back where the AI used their label.
      const named = (s: string) => s.replace(new RegExp(`\\b${r.player}\\b`, "g"), first || "you");
      return {
        match_id: matchId,
        player_id: byLabel.get(r.player)!,
        status: "draft",
        headline: named(c.headline),
        went_well: c.went_well.map(named),
        work_on: c.work_on.map((w) => ({ title: named(w.title), how: named(w.how) })),
        drills: c.drills.map((d) => ({ ...d, why: named(d.why) })),
        goal_ideas: c.goal_ideas.map((g) => ({ ...g, title: named(g.title), detail: named(g.detail) })),
        moments: ((rev.get(byLabel.get(r.player)!)?.moments ?? []) as { t: string; note: string }[]).filter((m) => m.t),
        ai: true,
        author_name: author,
      };
    });
  if (!save.length) return NextResponse.json({ ok: false, error: "The AI didn't return any reports. Try again." });
  const { error } = await supabase.from("match_reports").upsert(save, { onConflict: "match_id,player_id" });
  if (error) return NextResponse.json({ ok: false, error: error.message });
  return NextResponse.json({ ok: true, written: save.length });
}
