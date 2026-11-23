"""Key moments of a match, found from the tracking data, for the AI analyst report.

No pitch mapping needed: Veo's camera follows the ball from the halfway line, so the direction it looks
says roughly where the ball is along the pitch. We turn the ball's direction into a position from about
-1 (one goal) to +1 (the other goal), work out which way each team is attacking (they swap at half time),
and look for the moments an analyst would want to watch:

  * danger: the ball deep in a team's attacking end (shots, crosses, goalmouth scrambles)
  * high regain: a team wins the ball in the opposition half
  * final-third entry: a team moves the ball into the final third
  * long spell: a team keeps the ball for 25+ seconds

Then a strip of frames is cut for each moment, plus a few wide shots of the teams' shapes.
"""

from __future__ import annotations

import math
import os

import cv2
import numpy as np

PRIORITY = {"danger": 3, "high_regain": 2, "final_third": 1, "long_spell": 1}
MAX_MOMENTS = 36


def along_pitch(rows: np.ndarray) -> tuple[np.ndarray, dict]:
    """Ball and player positions along the pitch (-1 left goal … +1 right goal), from the camera direction."""
    theta = np.arctan2(rows[:, 3], rows[:, 5])
    players = rows[:, 6] == 0
    if players.sum() < 50:
        return np.zeros(len(rows)), {}
    th_p = theta[players]
    centre = float(np.median(th_p))
    lo, hi = float(np.percentile(th_p, 1.5)), float(np.percentile(th_p, 98.5))
    left = max(0.15, math.tan(min(1.45, centre - lo)))
    right = max(0.15, math.tan(min(1.45, hi - centre)))
    d = np.tan(np.clip(theta - centre, -1.45, 1.45))
    x = np.where(d < 0, d / left, d / right)
    return np.clip(x, -1.2, 1.2), {"centre": centre, "left": lo, "right": hi}


def directions(t, team, x, players) -> dict[int, int]:
    """Minute -> +1 if team 0 attacks to the right that minute, -1 if to the left (smoothed over 5 minutes)."""
    minute = (t // 60).astype(int)
    raw = {}
    for m in np.unique(minute[players]):
        a = players & (minute == m)
        x0, x1 = x[a & (team == 0)], x[a & (team == 1)]
        if len(x0) > 15 and len(x1) > 15:
            raw[int(m)] = 1 if np.median(x0) < np.median(x1) else -1
    out = {}
    ms = sorted(raw)
    for m in ms:
        near = [raw[k] for k in ms if abs(k - m) <= 2]
        out[m] = 1 if sum(near) >= 0 else -1
    return out


def find_moments(rows: np.ndarray, owner_at: dict[float, int | None]) -> dict:
    """Moments worth watching, and a few team-level numbers. `owner_at` maps each analysed time to the team
    in possession (0, 1, or None)."""
    if rows is None or not len(rows):
        return {"moments": [], "territory": None}
    t, team, kind = rows[:, 0], rows[:, 2].astype(int), rows[:, 6].astype(int)
    x, cam = along_pitch(rows)
    players = (kind == 0) & (team >= 0)
    dirs = directions(t, team, x, players)
    if not dirs:
        return {"moments": [], "territory": None}

    def att(xv: float, tt: float, tm: int) -> float:
        """Position along the pitch from team tm's point of view: +1 = the goal they attack."""
        d = dirs.get(int(tt // 60))
        if d is None:
            near = min(dirs, key=lambda k: abs(k - tt // 60))
            d = dirs[near]
        return xv * (d if tm == 0 else -d)

    ball = kind == 1
    bt, bx = t[ball], x[ball]
    order = np.argsort(bt)
    bt, bx = bt[order], bx[order]

    moments: list[dict] = []
    terr = {0: [0, 0, 0], 1: [0, 0, 0]}  # ball time in each team's defensive/middle/attacking third while they have it
    spell_owner, spell_start, last_x = None, None, {0: -9.0, 1: -9.0}
    danger_in_spell = False
    for tt, xv in zip(bt, bx):
        o = owner_at.get(round(float(tt), 1))
        if o is None:
            continue
        xa = att(float(xv), float(tt), o)
        terr[o][0 if xa < -1 / 3 else 1 if xa <= 1 / 3 else 2] += 1
        if o != spell_owner:
            # Possession changed. Won high up the pitch?
            if spell_owner is not None and xa >= 0.2:
                moments.append({"t": float(tt), "type": "high_regain", "team": o, "x": round(xa, 2)})
            if spell_owner is not None and spell_start is not None and tt - spell_start >= 25:
                moments.append({"t": float(spell_start), "type": "long_spell", "team": spell_owner, "x": None, "length": round(float(tt - spell_start))})
            spell_owner, spell_start, danger_in_spell = o, float(tt), False
            last_x[o] = xa
            continue
        if last_x[o] < 1 / 3 <= xa:
            moments.append({"t": float(tt), "type": "final_third", "team": o, "x": round(xa, 2)})
        if xa >= 0.75 and not danger_in_spell:
            moments.append({"t": float(tt), "type": "danger", "team": o, "x": round(xa, 2)})
            danger_in_spell = True
        last_x[o] = xa

    # Keep the most telling, spread out: no two within 15 seconds, at most MAX_MOMENTS.
    moments.sort(key=lambda m: (-PRIORITY[m["type"]], m["t"]))
    kept: list[dict] = []
    for m in moments:
        if all(abs(m["t"] - k["t"]) >= 15 for k in kept):
            kept.append(m)
        if len(kept) >= MAX_MOMENTS:
            break
    kept.sort(key=lambda m: m["t"])
    for i, m in enumerate(kept, 1):
        m["id"] = f"M{i}"
    tot = {k: sum(v) or 1 for k, v in terr.items()}
    counts = {tm: {ty: sum(1 for m in moments if m["team"] == tm and m["type"] == ty) for ty in PRIORITY} for tm in (0, 1)}
    return {
        "moments": kept,
        "territory": {str(tm): [round(100 * v / tot[tm], 1) for v in terr[tm]] for tm in (0, 1)},
        "counts": {str(k): v for k, v in counts.items()},
    }


def shape_times(timeline, n: int = 8) -> list[float]:
    """Times with the most players in view (good wide shots of both teams' shapes), spread across the match."""
    if not timeline:
        return []
    times = np.array([t for t, _, _ in timeline])
    counts = np.array([len(p) for _, _, p in timeline])
    edges = np.linspace(times.min(), times.max(), n + 1)
    out = []
    for a, b in zip(edges[:-1], edges[1:]):
        k = (times >= a) & (times < b)
        if k.any():
            out.append(float(times[k][int(np.argmax(counts[k]))]))
    return out


def grab(video: str, times: list[float], width: int) -> list[np.ndarray | None]:
    cap = cv2.VideoCapture(video)
    out = []
    for tt in times:
        cap.set(cv2.CAP_PROP_POS_MSEC, max(0.0, tt) * 1000)
        ok, f = cap.read()
        if not ok:
            out.append(None)
            continue
        h, w = f.shape[:2]
        out.append(cv2.resize(f, (width, round(h * width / w)), interpolation=cv2.INTER_AREA))
    cap.release()
    return out


def save_frames(video: str, moments: list[dict], shapes: list[float], folder: str) -> None:
    """Frame strips (2 × 2: 3 s before, 1 s before, 1 s after, 3 s after) per moment, and wide shape shots."""
    os.makedirs(folder, exist_ok=True)
    for m in moments:
        fs = grab(video, [m["t"] - 3, m["t"] - 1, m["t"] + 1, m["t"] + 3], 640)
        fs = [f for f in fs if f is not None]
        if not fs:
            continue
        while len(fs) < 4:
            fs.append(np.zeros_like(fs[0]))
        h = min(f.shape[0] for f in fs)
        fs = [f[:h] for f in fs]
        grid = np.vstack([np.hstack(fs[:2]), np.hstack(fs[2:])])
        for i, label in enumerate(["-3s", "-1s", "+1s", "+3s"]):
            x0, y0 = (i % 2) * fs[0].shape[1], (i // 2) * h
            cv2.putText(grid, label, (x0 + 8, y0 + 24), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2, cv2.LINE_AA)
        cv2.imwrite(os.path.join(folder, f"{m['id']}.jpg"), grid, [cv2.IMWRITE_JPEG_QUALITY, 80])
    for i, (tt, f) in enumerate(zip(shapes, grab(video, shapes, 1280))):
        if f is not None:
            cv2.imwrite(os.path.join(folder, f"S{i + 1}_{tt:.1f}.jpg"), f, [cv2.IMWRITE_JPEG_QUALITY, 80])
