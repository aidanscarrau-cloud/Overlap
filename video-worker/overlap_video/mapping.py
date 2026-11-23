"""Pitch stats in metres, once the coach has tapped a few pitch points on the panorama.

Input: the saved positions (camera rays) from the analysis and the coach's taps.
Output, for each of the two teams (0 and 1, as found by shirt colour):
  * heat map: where the team spent its time (always shown attacking left to right)
  * ball in each third: defending, middle, attacking
  * distance: average metres per player per minute, and the share of it at high speed
  * defensive line: how far the back line usually was from its own goal
  * width: how spread out the team was across the pitch
Plus a check picture: the standard pitch markings drawn on the panorama, so the coach can see the taps worked.
"""

from __future__ import annotations

import base64

import cv2
import numpy as np

from .camera import pano_pixel_to_ray, ray_to_pano
from .pitchmap import LANDMARKS, PitchModel, calibrate, pitch_lines

GRID_X, GRID_Y = 12, 8
HIGH_SPEED = 19.8 / 3.6  # m/s: the usual "high-speed running" line


def map_pitch(rows: np.ndarray, taps: dict[str, list[float]], pano_info: dict, pano_jpeg: str | None, length: float | None = None, width: float | None = None) -> dict:
    rays = {k: pano_pixel_to_ray(float(x), float(y), pano_info) for k, (x, y) in taps.items() if k in LANDMARKS}
    model = calibrate(rays, length, width)
    L, W = model.length, model.width
    t, tid, team, kind = rows[:, 0], rows[:, 1].astype(int), rows[:, 2].astype(int), rows[:, 6].astype(int)
    xy = model.to_pitch(rows[:, 3:6])
    inside = np.isfinite(xy).all(1) & (np.abs(xy[:, 0]) <= L / 2 + 3) & (xy[:, 1] >= -3) & (xy[:, 1] <= W + 3)
    players = (kind == 0) & inside & (team >= 0)
    ball = (kind == 1) & inside

    # Which way each team is attacking, minute by minute (they swap at half time): the team whose
    # players are, on average, nearer the left goal is defending it.
    minute = (t // 60).astype(int)
    attack_right = {}  # minute -> does team 0 attack to the right?
    for m in np.unique(minute[players]):
        a = players & (minute == m)
        x0 = xy[a & (team == 0), 0]
        x1 = xy[a & (team == 1), 0]
        if len(x0) > 20 and len(x1) > 20:
            attack_right[int(m)] = bool(np.median(x0) < np.median(x1))
    # Smooth over 5-minute stretches, so one odd minute (a corner, everyone forward) doesn't flip it.
    mins = sorted(attack_right)
    smooth = {}
    for m in mins:
        near = [attack_right[k] for k in mins if abs(k - m) <= 2]
        smooth[m] = sum(near) * 2 >= len(near)
    def facing(rows_min: np.ndarray, tm: int) -> np.ndarray:
        """+1 where team tm attacks right, -1 where it attacks left (by minute)."""
        r0 = np.array([smooth.get(int(m), True) for m in rows_min])
        right = r0 if tm == 0 else ~r0
        return np.where(right, 1.0, -1.0)

    out = {"pitch": {"length": round(L, 1), "width": round(W, 1), "fit_error_deg": round(model.error_deg, 2), "camera_height": round(float(model.C[2]), 1)}, "teams": []}
    for tm in (0, 1):
        sel = players & (team == tm)
        if sel.sum() < 50:
            out["teams"].append(None)
            continue
        f = facing(minute[sel], tm)
        x = xy[sel, 0] * f  # now always attacking towards +x
        y = xy[sel, 1]
        heat, _, _ = np.histogram2d(x, y, bins=[GRID_X, GRID_Y], range=[[-L / 2, L / 2], [0, W]])
        heat = heat / max(heat.sum(), 1)

        # Ball in each third, from this team's point of view.
        bsel = ball & np.isin(minute, [m for m in smooth])
        bf = facing(minute[bsel], tm)
        bx = xy[bsel, 0] * bf
        thirds = [float(np.mean(bx < -L / 6)), float(np.mean((bx >= -L / 6) & (bx <= L / 6))), float(np.mean(bx > L / 6))] if len(bx) > 30 else None

        dist, hs, player_secs = running(t[sel], tid[sel], xy[sel])
        # Defensive line and width, frame by frame: the deepest four outfield players (skip the deepest one,
        # usually the keeper), and the spread between the widest players.
        lines, widths = [], []
        ts, xs_, ys_ = t[sel], x, y
        for tt in np.unique(ts):
            k = ts == tt
            if k.sum() >= 7:
                order = np.sort(xs_[k])
                lines.append(np.mean(order[1:5]) + L / 2)
                yy = np.sort(ys_[k])
                widths.append(yy[-2] - yy[1])
        out["teams"].append(
            {
                "heat": np.round(heat * 1000).astype(int).tolist(),
                "ball_thirds": [round(100 * v, 1) for v in thirds] if thirds else None,
                "metres_per_min": round(dist / player_secs * 60, 1) if player_secs > 60 else None,
                "high_speed_pct": round(100 * hs / dist, 1) if dist > 0 else None,
                "defensive_line_m": round(float(np.median(lines)), 1) if lines else None,
                "width_m": round(float(np.median(widths)), 1) if widths else None,
            }
        )
    out["check_jpeg"] = check_picture(model, pano_info, pano_jpeg, taps)
    out["grid"] = [GRID_X, GRID_Y]
    out["model"] = model.as_dict()
    return out


def running(t, tid, xy):
    """Distance covered: per track, positions smoothed over about a second, ignoring impossible jumps."""
    dist = hs = secs = 0.0
    for k in np.unique(tid):
        m = tid == k
        if m.sum() < 6:
            continue
        tt, pp = t[m], xy[m]
        o = np.argsort(tt)
        tt, pp = tt[o], pp[o]
        # Median-smooth the positions (detections wobble by a box-width).
        w = 5
        sm = np.array([np.median(pp[max(0, i - w // 2) : i + w // 2 + 1], axis=0) for i in range(len(pp))])
        d = np.linalg.norm(np.diff(sm, axis=0), axis=1)
        dt = np.diff(tt)
        ok = (dt > 0) & (dt < 1.0)
        v = np.where(ok, d / np.where(dt > 0, dt, 1), 0)
        ok &= v < 10.5  # faster than a sprinter: a tracking jump, not running
        dist += d[ok].sum()
        hs += d[ok & (v > HIGH_SPEED)].sum()
        secs += dt[ok].sum()
    return dist, hs, secs


def check_picture(model: PitchModel, info: dict, pano_jpeg: str | None, taps: dict) -> str | None:
    if not pano_jpeg:
        return None
    img = cv2.imdecode(np.frombuffer(base64.b64decode(pano_jpeg), np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        return None
    s = info["scale"]
    for line in pitch_lines(model.length, model.width):
        p = ray_to_pano(model.to_ray(line), s)
        p[:, 0] -= info["theta0"] * s
        p[:, 1] -= info["phi0"] * s
        ok = np.isfinite(p).all(1)
        cv2.polylines(img, [p[ok].astype(np.int32).reshape(-1, 1, 2)], False, (255, 0, 255), 2, cv2.LINE_AA)
    for x, y in taps.values():
        cv2.circle(img, (int(x), int(y)), 6, (0, 255, 255), 2, cv2.LINE_AA)
    ok, jpg = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 75])
    return base64.b64encode(jpg.tobytes()).decode() if ok else None
