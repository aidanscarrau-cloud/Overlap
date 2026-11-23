"""Training data for Overlap's own event-spotting model, from clubs that have agreed to share it.

For each tagged event on a match video we keep a short, small clip (4 s, 360p, no sound) and its label
(the event type, outcome and which side). We also keep some "nothing happening" clips from the same match,
so a model can learn the difference. No names, shirt numbers, contact details or anything else that
identifies a person are stored with the clips.

Clips live in the worker's private storage under the club's folder, so withdrawing consent deletes them all.
ffmpeg reads only the seconds it needs from the video over the network; the full match isn't downloaded.
"""

from __future__ import annotations

import json
import os
import random
import shutil
import subprocess

TRAINING_DIR = os.environ.get("OVERLAP_TRAINING_DIR", os.path.join(os.path.dirname(__file__), "..", "training"))
CLIP_SECONDS = 4.0
MAX_PHASE = 8.0  # phases (a press, a counter) are kept up to 8 s


def club_dir(club_id: str) -> str:
    safe = "".join(c for c in club_id if c.isalnum() or c == "-")[:64]
    return os.path.join(TRAINING_DIR, safe)


def cut(url: str, start: float, length: float, out: str) -> bool:
    """A small clip, read straight from the video address (only the needed bytes are fetched)."""
    cmd = [
        "ffmpeg", "-loglevel", "error", "-y",
        "-ss", f"{max(0.0, start):.2f}", "-i", url, "-t", f"{length:.2f}",
        "-vf", "scale=-2:360", "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "28",
        out,
    ]
    try:
        subprocess.run(cmd, check=True, timeout=120)
        return os.path.exists(out) and os.path.getsize(out) > 1000
    except (subprocess.SubprocessError, OSError):
        return False


def collect(job: dict) -> dict:
    """job: {club_id, match_id, video_url, events: [{id, t, t_end, kind, outcome, team}], duration}"""
    folder = os.path.join(club_dir(job["club_id"]), job["match_id"])
    shutil.rmtree(folder, ignore_errors=True)  # re-collecting a match replaces its clips (tags may have changed)
    os.makedirs(folder, exist_ok=True)
    url = job["video_url"]
    events = sorted(job.get("events") or [], key=lambda e: e["t"])
    manifest = []
    for e in events[:400]:
        t, t_end = float(e["t"]), e.get("t_end")
        if t_end is not None and float(t_end) > t:
            start, length = t - 1.0, min(MAX_PHASE, float(t_end) - t + 2.0)
        else:
            start, length = t - CLIP_SECONDS / 2, CLIP_SECONDS
        name = f"{e['id']}.mp4"
        if cut(url, start, length, os.path.join(folder, name)):
            manifest.append({"clip": name, "label": e["kind"], "outcome": e.get("outcome") or "", "side": e.get("team") or "", "event_at": round(t - start, 2), "length": round(length, 2)})
    # "Nothing happening" clips: at least 10 s from any tagged event, about half as many as the events.
    duration = float(job.get("duration") or (events[-1]["t"] + 60 if events else 0))
    rng = random.Random(job["match_id"])
    taken, tries = 0, 0
    while taken < max(3, len(manifest) // 2) and tries < 200 and duration > 60:
        tries += 1
        c = rng.uniform(30, duration - 30)
        if any(abs(c - float(e["t"])) < 10 for e in events):
            continue
        name = f"bg_{taken}.mp4"
        if cut(url, c - CLIP_SECONDS / 2, CLIP_SECONDS, os.path.join(folder, name)):
            manifest.append({"clip": name, "label": "background", "outcome": "", "side": "", "event_at": CLIP_SECONDS / 2, "length": CLIP_SECONDS})
            taken += 1
    with open(os.path.join(folder, "labels.jsonl"), "w") as f:
        for row in manifest:
            f.write(json.dumps(row) + "\n")
    return {"clips": len(manifest)}


def withdraw(club_id: str, match_ids: list[str] | None = None) -> None:
    """Delete a club's training clips: all of them, or just some matches' (when one team withdraws)."""
    if not match_ids:
        shutil.rmtree(club_dir(club_id), ignore_errors=True)
        return
    for m in match_ids:
        safe = "".join(c for c in m if c.isalnum() or c == "-")[:64]
        shutil.rmtree(os.path.join(club_dir(club_id), safe), ignore_errors=True)
