import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { playerTagLine, tally, type MatchEvent } from "@/lib/analysis";
import { aiConfigured, cleanReport, drillCatalogue, scrubNames, writeReports, type AiPlayer } from "@/lib/match-ai";

// Writing a squad's reports can take a minute or two.
export const maxDuration = 300;

/** Fair-use cap on AI reports per club per 30 days (about 2 matches a week for 8 teams). */
const MONTHLY_CAP = 1200;

type Body = { match_id?: string; player_ids?: string[] };

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
  // Coaching staff of this team only, on Pro, with match review switched on for the team by a club admin.
  const { data: allowed, error: okErr } = await supabase.rpc("match_review_ok", { mid: matchId });
  if (okErr) return NextResponse.json({ ok: false, error: "Run update 33 in Supabase first." });
  if (!allowed) return NextResponse.json({ ok: false, error: "Match review is only for this team's coaching staff, on Overlap Pro, once a club admin has switched it on for the team." });

  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const { count } = await supabase.from("match_reports").select("id", { count: "exact", head: true }).eq("club_id", match.club_id).eq("ai", true).gte("updated_at", since);

  const [{ data: squad }, { data: reviews }, { data: team }, { data: drills }, { data: videoRow }, { data: sessions }] = await Promise.all([
    supabase.from("match_players").select("player_id,role,minutes,goals,assists,yellow,red").eq("match_id", matchId),
    supabase.from("match_reviews").select("*").eq("match_id", matchId),
    supabase.from("teams").select("name,age_group").eq("id", match.team_id).maybeSingle(),
    supabase.from("drills").select("id,name,category,description").eq("club_id", match.club_id).order("name").limit(150),
    supabase.from("match_video_jobs").select("id,our_team,results").eq("match_id", matchId).eq("status", "done").not("our_team", "is", null).order("created_at", { ascending: false }).limit(1),
    supabase.from("sessions").select("focus").eq("team_id", match.team_id).lte("date", match.date).order("date", { ascending: false }).limit(4),
  ]);
  const want = new Set((body.player_ids ?? []).filter((x) => typeof x === "string"));
  const rows = (squad ?? []).filter((r) => (want.size ? want.has(r.player_id) : true));
  if (!rows.length) return NextResponse.json({ ok: false, error: "Pick the squad first, then log their stats." });
  if (rows.length > 30) return NextResponse.json({ ok: false, error: "That's more than 30 players. Write reports for fewer at a time." });
  if ((count ?? 0) + rows.length > MONTHLY_CAP) return NextResponse.json({ ok: false, error: "Your club has reached this month's fair-use limit for AI reports. Contact us if you need more." });

  const ids = rows.map((r) => r.player_id as string);
  const [{ data: players }, { data: goals }, { data: recent }] = await Promise.all([
    supabase.from("players").select("id,full_name,position,shirt_number").in("id", ids),
    supabase.from("player_goals").select("player_id,area,title").in("player_id", ids).eq("status", "active"),
    supabase.from("match_reports").select("player_id,work_on,updated_at").in("player_id", ids).neq("match_id", matchId).order("updated_at", { ascending: false }).limit(ids.length * 2),
  ]);
  const byId = new Map((players ?? []).map((p) => [p.id as string, p]));
  const labels = new Map(ids.map((id, i) => [id, `P${i + 1}`]));
  const names = ids.map((id) => ({ full: (byId.get(id)?.full_name as string) ?? "", label: labels.get(id)! })).filter((n) => n.full);
  const rev = new Map((reviews ?? []).map((r) => [r.player_id as string, r]));
  const scrub = (s: string) => scrubNames(s, names);

  // Per-player stats from the match video, matched by shirt number (the coach's choices first).
  const vjob = videoRow?.[0] as { id: string; our_team: number | null; results: { players?: { team: number; number: number; seen_s: number; on_ball_s: number }[]; mapping?: { players?: { team: number; number: number; metres_per_min: number | null; avg_from_own_goal_m: number }[] } } | null } | undefined;
  let chosen: Record<string, string> = {};
  if (vjob) {
    const { data: nrow } = await supabase.from("match_video_jobs").select("numbers").eq("id", vjob.id).maybeSingle();
    chosen = ((nrow as { numbers?: Record<string, string> } | null)?.numbers ?? {}) as Record<string, string>;
  }
  const videoFor = (pid: string): string | undefined => {
    if (!vjob?.results?.players || vjob.our_team === null) return undefined;
    const shirt = byId.get(pid)?.shirt_number as number | null | undefined;
    const me = vjob.results.players.find((x) => x.team === vjob.our_team && (chosen[String(x.number)] ? chosen[String(x.number)] === pid : shirt != null && x.number === shirt));
    if (!me) return undefined;
    const pm = vjob.results.mapping?.players?.find((x) => x.team === me.team && x.number === me.number);
    return [
      `seen on video for about ${Math.round(me.seen_s / 60)} min (only while their number was readable)`,
      `about ${Math.round(me.on_ball_s)} s on the ball in that time`,
      pm?.metres_per_min ? `running pace about ${((pm.metres_per_min * 90) / 1000).toFixed(1)} km per 90 min` : "",
      pm ? `usually ${Math.round(pm.avg_from_own_goal_m)} m from our goal` : "",
    ]
      .filter(Boolean)
      .join("; ");
  };
  // Events the analyst tagged on the match video (if update 38 has run and anything was tagged).
  const { data: evRows } = await supabase.from("match_events").select("id,match_id,t,kind,team,player_id,shirt,x,y,outcome,routine,note,pre,post,created_at").eq("match_id", matchId);
  const tags = tally((evRows ?? []) as MatchEvent[]);
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
      video: videoFor(r.player_id),
      tags: playerTagLine(tags.players.get(r.player_id)) || undefined,
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
        videoStats: [videoSummary(videoRow?.[0]), teamTagLine(tags)].filter(Boolean).join(" ") || undefined,
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

/** One line of team stats from the video analysis, for the AI prompt. */
function videoSummary(row?: { our_team: number | null; results: unknown } | null) {
  const r = row?.results as { possession?: { pct?: number[]; by_5_min?: { from_min: number; team0_pct: number | null }[] }; quality?: { ball_seen_pct?: number } } | null | undefined;
  if (!r?.possession?.pct || row?.our_team == null) return undefined;
  const us = Math.round(r.possession.pct[row.our_team] ?? 0);
  const halves = (r.possession.by_5_min ?? []).filter((b) => b.team0_pct !== null);
  const trend = halves.length >= 4 ? ` By 5-minute block (our %): ${halves.map((b) => `${b.from_min}' ${Math.round(row.our_team === 0 ? b.team0_pct! : 100 - b.team0_pct!)}%`).join(", ")}.` : "";
  const m = (r as { mapping?: { teams?: ({ ball_thirds?: number[] | null; metres_per_min?: number | null; defensive_line_m?: number | null } | null)[] } }).mapping?.teams?.[row.our_team];
  const pitch = m
    ? [
        m.ball_thirds ? ` Ball in our defensive third ${Math.round(m.ball_thirds[0])}%, middle ${Math.round(m.ball_thirds[1])}%, attacking third ${Math.round(m.ball_thirds[2])}%.` : "",
        m.metres_per_min ? ` Team running about ${((m.metres_per_min * 90) / 1000).toFixed(1)} km per player per 90 minutes.` : "",
        m.defensive_line_m ? ` Back line usually ${Math.round(m.defensive_line_m)} m from our goal.` : "",
      ].join("")
    : "";
  const rep = (r as { report?: { headline?: string; summary?: string[] } }).report;
  const analyst = rep?.headline ? ` Analyst report: ${rep.headline} ${(rep.summary ?? []).slice(0, 4).join(" ")}` : "";
  return `Possession ${us}% us, ${100 - us}% them.${trend}${pitch}${analyst}${(r.quality?.ball_seen_pct ?? 100) < 25 ? " (Low confidence: ball often not visible.)" : ""}`;
}

/** Match totals from tagged events, for the AI prompt. */
function teamTagLine(t: ReturnType<typeof tally>) {
  const n = (side: "us" | "them", k: string) => t.team[side].get(k) ?? 0;
  if (!t.team.us.size && !t.team.them.size) return "";
  return `Tagged by the analyst: shots ${n("us", "shot")} (${n("us", "shot_on")} on target) vs ${n("them", "shot")} (${n("them", "shot_on")}); box entries ${n("us", "box_entry")} vs ${n("them", "box_entry")}; balls won ${n("us", "turnover_won")}, lost ${n("us", "turnover_lost")}.`;
}
