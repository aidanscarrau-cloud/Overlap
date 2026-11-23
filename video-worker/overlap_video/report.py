"""The AI analyst report: Claude reviews the key moments (frame strips) and the match numbers and writes what a
qualified performance analyst would hand the coaching staff.

Runs on the worker (the frames never leave it except to Anthropic's API). Needs ANTHROPIC_API_KEY in the
worker's environment. MATCH_AI_MOCK=1 writes a canned report for local testing without a key.
"""

from __future__ import annotations

import base64
import glob
import json
import os

MODEL = "claude-opus-5-5"

SYSTEM = """You are a UEFA-qualified football performance analyst with a sports-science degree, working for an Australian club's coaching staff. You've been given a match: the tracking numbers from Overlap's video analysis, and frame strips of the key moments (each strip is 2 × 2: 3 seconds before, 1 second before, 1 second after and 3 seconds after the moment), plus a few wide shots of both teams' shapes.

Write the post-match analysis the head coach would want on their desk the next morning: clear, specific, honest and useful for planning training.

How to work:
- Base every point on what you can actually see in the frames or on the numbers given. When the picture isn't clear (players far from the camera, the ball hidden), say "appears to" or leave it out. Never invent goals, scores, shots, player names or events you can't see.
- Each moment comes with a label from the automatic tracking (e.g. "won the ball in the opposition half"). Labels are guesses, and are least reliable right at the ends of the pitch: trust what you see in the frames over the label, and describe what actually happened.
- The camera is a single wide follow-cam: you won't see everything. Prefer patterns (things that happen in several moments) over one-offs, and cite the moment IDs (e.g. M4, M11) that show each point so the coach can watch them.
- Refer to the teams by name and shirt colour. Refer to players only by team and shirt number, and only when the number is legible or given in the numbers.
- Cover the game's phases: in possession (build-up, progression, chance creation), out of possession (press height and triggers, block, compactness), both transitions, and set pieces if any are visible. Then the opposition: their threats and weaknesses.
- Keep "what to work on" to the 2-3 things that would make the biggest difference, and link them to drills from the club's drill list when one fits (use the refs exactly).
- Match the language to the age group given: for junior teams keep it developmental and constructive.
- Write in plain Australian English for coaches, not academics. No hype."""

SECTION_KEYS = ["in_possession", "out_of_possession", "attacking_transition", "defensive_transition", "set_pieces", "opposition"]

SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["headline", "summary", "sections", "key_moments", "periods", "players", "training_focus", "questions", "confidence"],
    "properties": {
        "headline": {"type": "string", "description": "One sentence: the story of the match from our point of view."},
        "summary": {"type": "array", "items": {"type": "string"}, "description": "3-5 bullet points the head coach must know."},
        "sections": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["key", "title", "points"],
                "properties": {
                    "key": {"type": "string", "enum": SECTION_KEYS},
                    "title": {"type": "string"},
                    "points": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "required": ["text", "moments"],
                            "properties": {"text": {"type": "string"}, "moments": {"type": "array", "items": {"type": "string"}, "description": "Moment IDs that show this, e.g. M4."}},
                        },
                    },
                },
            },
        },
        "key_moments": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["id", "title", "what_happened", "coaching_point", "verdict"],
                "properties": {
                    "id": {"type": "string"},
                    "title": {"type": "string", "description": "Short, like a clip title."},
                    "what_happened": {"type": "string"},
                    "coaching_point": {"type": "string"},
                    "verdict": {"type": "string", "enum": ["positive", "negative", "neutral"], "description": "Good or bad for us."},
                },
            },
            "description": "The 8-15 moments most worth showing the coaching staff, from the IDs given.",
        },
        "periods": {"type": "string", "description": "How the game changed over time (first 15 minutes, after half time, the end), from the numbers by 5 minutes."},
        "players": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["team", "shirt", "note"],
                "properties": {"team": {"type": "string", "enum": ["us", "them"]}, "shirt": {"type": "integer"}, "note": {"type": "string"}},
            },
            "description": "Only players clearly identifiable by shirt number. Leave empty if none.",
        },
        "training_focus": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["theme", "why", "drills"],
                "properties": {"theme": {"type": "string"}, "why": {"type": "string"}, "drills": {"type": "array", "items": {"type": "string"}, "description": "Drill refs from the list, copied exactly."}},
            },
        },
        "questions": {"type": "array", "items": {"type": "string"}, "description": "Things the analyst couldn't tell from the video and would ask the coach about."},
        "confidence": {"type": "string", "description": "One or two sentences on how much of the match could be seen and how sure the analysis is."},
    },
}

TYPE_WORDS = {"danger": "ball deep in their attacking end (possible shot/cross)", "high_regain": "won the ball in the opposition half", "final_third": "moved the ball into the final third", "long_spell": "kept the ball for a long spell"}


def clock(t: float) -> str:
    s = int(max(0, t))
    return f"{s // 3600}:{(s % 3600) // 60:02d}:{s % 60:02d}" if s >= 3600 else f"{s // 60}:{s % 60:02d}"


def build_content(job: dict, frames_dir: str) -> list[dict]:
    r = job["results"]
    us = int(job["us"])
    names = {us: f"{job['our_name']} ({job.get('our_colour', '')} shirts)", 1 - us: f"{job['their_name']} ({job.get('their_colour', '')} shirts)"}
    key = r.get("key") or {}
    moments = key.get("moments") or []
    ctx = job.get("context") or {}
    poss = r.get("possession") or {}
    p_us = (poss.get("pct") or [0, 0])[us]
    by5 = [f"{b['from_min']}-{b['from_min'] + 5} min: {round(b['team0_pct'] if us == 0 else 100 - b['team0_pct'])}%" for b in (poss.get("by_5_min") or []) if b.get("team0_pct") is not None]
    terr = key.get("territory") or {}
    counts = key.get("counts") or {}
    numbers = [f"{'us' if p['team'] == us else 'them'} #{p['number']}: seen {round(p['seen_s'] / 60)} min, {round(p['on_ball_s'])} s on the ball" for p in (r.get("players") or [])]
    lines = [
        f"Match: {job['our_name']} vs {job['their_name']}. We are {names[us]}; the opposition is {names[1 - us]}.",
        f"Age group: {job.get('age_group') or 'not given'}.",
        f"Coach's notes: result {ctx.get('score') or 'not given'}; our formation {ctx.get('formation') or 'not given'}; game plan: {ctx.get('plan') or 'not given'}; anything else: {ctx.get('notes') or 'none'}.",
        f"Video analysed: {round((r.get('video') or {}).get('analysed_seconds', 0) / 60)} minutes. Ball visible in {(r.get('quality') or {}).get('ball_seen_pct', '?')}% of moments.",
        f"Possession (from who was nearest the ball): us {round(p_us)}%, them {round(100 - p_us)}%. By 5 minutes (our share, video time): {'; '.join(by5) or 'n/a'}.",
    ]
    if terr:
        t_us, t_them = terr.get(str(us)), terr.get(str(1 - us))
        if t_us and t_them:
            lines.append(f"While in possession, share of time in their own defensive / middle / attacking third: us {t_us[0]}/{t_us[1]}/{t_us[2]}%, them {t_them[0]}/{t_them[1]}/{t_them[2]}%.")
    if counts:
        c_us, c_them = counts.get(str(us), {}), counts.get(str(1 - us), {})
        lines.append(
            "Counted across the whole video (before picking the moments to show): "
            + ", ".join(f"{TYPE_WORDS[k].split(' (')[0]}: us {c_us.get(k, 0)}, them {c_them.get(k, 0)}" for k in TYPE_WORDS)
            + "."
        )
    if numbers:
        lines.append("Players identified by shirt number (partial: only while the number was readable): " + "; ".join(numbers) + ".")
    drills = job.get("drills") or []
    if drills:
        lines.append("Club drill list (ref | name | type):\n" + "\n".join(f"{d['ref']} | {d['name']} | {d.get('kind', '')}" for d in drills[:150]))
    content: list[dict] = [{"type": "text", "text": "\n".join(lines)}]

    content.append({"type": "text", "text": "Key moments (video time; the strip shows 3 s before to 3 s after):"})
    for m in moments:
        f = os.path.join(frames_dir, f"{m['id']}.jpg")
        who = names.get(int(m["team"]), "a team")
        desc = f"{m['id']} at {clock(m['t'])}. Tracking suggests: {who} {TYPE_WORDS.get(m['type'], m['type'])}" + (f" ({m['length']} s)" if m.get("length") else "") + ". Check the frames."
        content.append({"type": "text", "text": desc})
        if os.path.exists(f):
            content.append({"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": base64.b64encode(open(f, "rb").read()).decode()}})
    shapes = sorted(glob.glob(os.path.join(frames_dir, "S*.jpg")))
    if shapes:
        content.append({"type": "text", "text": "Wide shots of both teams' shapes at different points in the match:"})
        for f in shapes[:8]:
            tt = float(os.path.basename(f).split("_")[1][:-4])
            content.append({"type": "text", "text": f"Shape at {clock(tt)}"})
            content.append({"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": base64.b64encode(open(f, "rb").read()).decode()}})
    content.append({"type": "text", "text": "Write the analysis now."})
    return content


def write_report(job: dict, frames_dir: str) -> dict:
    moments = ((job["results"].get("key") or {}).get("moments")) or []
    if not os.environ.get("ANTHROPIC_API_KEY") and os.environ.get("MATCH_AI_MOCK") == "1":
        return mock(job, moments)
    import anthropic

    client = anthropic.Anthropic()
    req = dict(
        model=MODEL,
        max_tokens=32000,
        system=SYSTEM,
        output_config={"effort": "high", "format": {"type": "json_schema", "schema": SCHEMA}},
        messages=[{"role": "user", "content": build_content(job, frames_dir)}],
    )
    try:
        # If the model declines, the API can hand the request to a fallback model in the same call.
        with client.beta.messages.stream(**req, betas=["server-side-fallback-2026-07-01"], fallbacks="default") as s:
            msg = s.get_final_message()
    except anthropic.BadRequestError as e:
        print("report: retrying without fallbacks:", e)
        with client.beta.messages.stream(**req) as s:
            msg = s.get_final_message()
    if msg.stop_reason == "refusal":
        raise RuntimeError("The AI couldn't write this report.")
    if msg.stop_reason == "max_tokens":
        raise RuntimeError("The report was too long to finish.")
    text = "".join(b.text for b in msg.content if getattr(b, "type", "") == "text")
    report = json.loads(text)
    return tidy(report, moments, job.get("drills") or [])


def tidy(report: dict, moments: list[dict], drills: list[dict]) -> dict:
    """Keep only moment IDs and drill refs that exist; attach each moment's video time."""
    ids = {m["id"]: m for m in moments}
    refs = {d["ref"]: d["name"] for d in drills}
    for s in report.get("sections", []):
        for p in s.get("points", []):
            p["moments"] = [x for x in p.get("moments", []) if x in ids]
    report["key_moments"] = [dict(k, t=ids[k["id"]]["t"], team=ids[k["id"]]["team"]) for k in report.get("key_moments", []) if k.get("id") in ids]
    for f in report.get("training_focus", []):
        f["drills"] = [{"ref": r, "name": refs[r]} for r in f.get("drills", []) if r in refs]
    return report


def mock(job: dict, moments: list[dict]) -> dict:
    us = int(job["us"])
    km = [
        {"id": m["id"], "title": TYPE_WORDS[m["type"]].capitalize(), "what_happened": "Test report: no AI key set.", "coaching_point": "Watch this back with the players.", "verdict": "positive" if m["team"] == us else "negative"}
        for m in moments[:10]
    ]
    return tidy(
        {
            "headline": f"Test report for {job['our_name']} vs {job['their_name']} (no AI key set).",
            "summary": ["This is a placeholder written without the AI, to test the screens."],
            "sections": [{"key": k, "title": k.replace("_", " ").capitalize(), "points": [{"text": "Placeholder point.", "moments": [m["id"] for m in moments[:2]]}]} for k in SECTION_KEYS],
            "key_moments": km,
            "periods": "Placeholder.",
            "players": [],
            "training_focus": [{"theme": "Placeholder", "why": "Testing.", "drills": [d["ref"] for d in (job.get("drills") or [])[:1]]}],
            "questions": ["Placeholder question?"],
            "confidence": "Test only.",
        },
        moments,
        job.get("drills") or [],
    )
