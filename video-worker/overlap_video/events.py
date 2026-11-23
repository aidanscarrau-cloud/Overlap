"""Auto-tagging: the match events a video analyst would tag, found from everyone's tracked positions.

Runs once the pitch is mapped (positions in metres). Our own rules, no trained model needed:
  * restarts: the ball sits still for a few seconds, then is kicked. Where it sat says what it was:
    a corner, a free kick, a throw-in (only long throws into the box are tagged) or a kick-off.
  * kick-offs mark the start of each half (the match clock) and, after a goal, who scored.
  * shots: the ball travels fast towards a goal from within shooting range.
  * crosses: fast balls from a wide area of the final third into the box.
  * box entries: the attacking team takes the ball into the penalty area and keeps it.
  * high regains: the ball is won back in the attacking third.

Positions from one wide camera are imperfect (the ball is often hidden or in the air), so every tag is
marked as automatic for a coach to confirm, fix or delete. Each event: t (seconds), kind, team (0 or 1, as
found by shirt colour), outcome, x/y (0-100, attacking left to right), confidence (0-1).
"""

from __future__ import annotations

import bisect

import numpy as np

BOX_DEPTH, BOX_HALF = 16.5, 20.16
GOAL_HALF = 3.66


def auto_tag(t: np.ndarray, tid: np.ndarray, team: np.ndarray, kind: np.ndarray, xy: np.ndarray, L: float, W: float, attack_right) -> dict:
    """attack_right(minute) -> True when team 0 attacks towards +x in that minute."""
    players = (kind == 0) & (team >= 0) & np.isfinite(xy).all(1)
    ball_rows = (kind == 1) & np.isfinite(xy).all(1)
    frames = np.unique(t[players | ball_rows])
    if len(frames) < 50:
        return {"events": [], "periods": []}
    dt = float(np.median(np.diff(frames))) if len(frames) > 1 else 0.2

    # ---- The ball, one position per frame: drop impossible jumps, fill short gaps.
    bt, bxy = t[ball_rows], xy[ball_rows]
    o = np.argsort(bt)
    bt, bxy = bt[o], bxy[o]
    inside = (np.abs(bxy[:, 0]) <= L / 2 + 4) & (bxy[:, 1] >= -4) & (bxy[:, 1] <= W + 4)
    bt, bxy = bt[inside], bxy[inside]
    keep = np.ones(len(bt), bool)
    for i in range(1, len(bt)):
        j = i - 1
        while j >= 0 and not keep[j]:
            j -= 1
        if j >= 0 and bt[i] - bt[j] < 1.5 and np.linalg.norm(bxy[i] - bxy[j]) / max(bt[i] - bt[j], dt) > 50:
            keep[i] = False
    bt, bxy = bt[keep], bxy[keep]
    ball = {round(float(a), 2): b for a, b in zip(bt, bxy)}

    # ---- Players per frame.
    order = np.argsort(t)
    by_frame: dict[float, list[tuple[int, int, np.ndarray]]] = {}
    for i in order[players[order]]:
        by_frame.setdefault(round(float(t[i]), 2), []).append((int(tid[i]), int(team[i]), xy[i]))

    def direction(tm: int, at: float) -> float:
        r = attack_right(int(at // 60))
        return 1.0 if (r if tm == 0 else not r) else -1.0

    def rel(tm: int, at: float, p) -> tuple[float, float]:
        """Position from team tm's point of view: x from -L/2 (own goal) to L/2 (goal they attack)."""
        d = direction(tm, at)
        return float(p[0] * d), float(p[1] if d > 0 else W - p[1])

    def pct(tm: int, at: float, p) -> tuple[float, float]:
        x, y = rel(tm, at, p)
        return round(float(np.clip((x + L / 2) / L * 100, 0, 100)), 1), round(float(np.clip(y / W * 100, 0, 100)), 1)

    # ---- Who has the ball: the nearest outfield player within 2 m, carried through gaps of up to 2 s.
    times = sorted(by_frame)

    def window(a: float, b: float) -> list[float]:
        return times[bisect.bisect_left(times, a - 1e-6) : bisect.bisect_right(times, b + 1e-6)]
    owner: dict[float, tuple[int, int] | None] = {}
    touching: set[float] = set()  # frames where a player is actually at the ball (not carried over a gap)
    last, last_t = None, -1e9
    for ft in times:
        b = ball.get(ft)
        cur = None
        if b is not None:
            best, bd = None, 2.0
            for k, tm, p in by_frame[ft]:
                d = float(np.hypot(*(p - b)))
                if d < bd:
                    best, bd = (k, tm), d
            cur = best
        if cur is not None:
            last, last_t = cur, ft
            owner[ft] = cur
            touching.add(ft)
        else:
            owner[ft] = last if ft - last_t <= 2.0 else None

    def owner_team(at: float) -> int | None:
        o_ = owner.get(round(at, 2))
        return o_[1] if o_ else None

    def last_owner_before(at: float, within: float = 2.0) -> tuple[int, int] | None:
        for ft in reversed(window(at - within, at)):
            if owner.get(ft):
                return owner[ft]
        return None

    def nearest_team(at: float, p) -> int | None:
        best, bd = None, 8.0
        for ft in window(at - 0.6, at + 0.6):
            for _, tm, q in by_frame[ft]:
                d = float(np.hypot(*(q - p)))
                if d < bd:
                    best, bd = tm, d
        return best

    events: list[dict] = []

    def add(at: float, kind_: str, tm: int, p, outcome: str = "", conf: float = 0.5, **extra):
        x, y = pct(tm, at, p)
        events.append({"t": round(float(at), 1), "kind": kind_, "team": int(tm), "outcome": outcome, "x": x, "y": y, "confidence": round(conf, 2), **extra})

    # ---- Ball velocity (m/s), between consecutive sightings no more than 0.6 s apart.
    vel = []
    for i in range(1, len(bt)):
        g = bt[i] - bt[i - 1]
        if 0 < g <= 0.6:
            vel.append((float(bt[i - 1]), bxy[i - 1], (bxy[i] - bxy[i - 1]) / g))

    # ---- Restarts: the ball still (within 1.5 m) for at least 2.5 s, then moving.
    restarts = []
    i = 0
    while i < len(bt):
        j = i
        while j + 1 < len(bt) and bt[j + 1] - bt[j] <= 1.0 and np.linalg.norm(bxy[j + 1] - bxy[i]) < 1.5:
            j += 1
        if bt[j] - bt[i] >= 2.5:
            # it must then move off: a sighting 3 m+ away within 3 s
            moved = None
            for k in range(j + 1, len(bt)):
                if bt[k] - bt[j] > 3:
                    break
                if np.linalg.norm(bxy[k] - bxy[j]) > 3:
                    moved = k
                    break
            if moved is not None:
                restarts.append((float(bt[j]), bxy[i:j + 1].mean(0), float(bt[j] - bt[i]), moved))
                i = moved
                continue
        i = j + 1

    kickoffs = []
    for at, p, still, k in restarts:
        x, y = float(p[0]), float(p[1])
        near_end = abs(x) > L / 2 - 2.5
        near_side = y < 2.0 or y > W - 2.0
        if near_end and (y < 3.5 or y > W - 3.5):
            # A corner: taken by the team attacking that end.
            tm = 0 if direction(0, at) * np.sign(x) > 0 else 1
            add(at, "corner", tm, p, conf=0.75)
        elif abs(x) < 2.5 and abs(y - W / 2) < 2.5:
            kickoffs.append((at, nearest_team(at, p)))
        elif near_side and not near_end:
            # Throw-ins are only tagged when it's a long throw into the box.
            end = bxy[min(k + 3, len(bxy) - 1)]
            tm = nearest_team(at, p)
            if tm is not None:
                ex, ey = rel(tm, at, end)
                if ex > L / 2 - BOX_DEPTH - 2 and abs(ey - W / 2) < BOX_HALF + 2 and np.linalg.norm(end - p) > 15:
                    add(at, "throw_in", tm, p, conf=0.55)
        elif abs(x) > L / 2 - 7 and abs(y - W / 2) < 10:
            pass  # a goal kick
        elif still >= 3.0:
            tm = last_owner_before(at + 1.0, 1.0)
            tm = tm[1] if tm else nearest_team(at, p)
            if tm is not None:
                rx, _ = rel(tm, at, p)
                add(at, "free_kick", tm, p, conf=0.5 if rx < 0 else 0.6)

    # ---- Shots and crosses, from fast ball movement.
    last_shot = -10.0
    last_cross = -10.0
    for at, p, v in vel:
        speed = float(np.hypot(*v))
        if speed < 10:
            continue
        o_ = last_owner_before(at, 1.5)
        if not o_:
            continue
        tm = o_[1]
        d = direction(tm, at)
        rx, ry = rel(tm, at, p)
        rvx = v[0] * d
        rvy = v[1] if d > 0 else -v[1]
        goal_x = L / 2
        if speed >= 13 and rvx > 6 and goal_x - rx < 35 and at - last_shot > 4:
            # Where would it cross the goal line?
            tt = (goal_x - rx) / rvx
            cy = ry + rvy * tt
            if abs(cy - W / 2) < 12:
                outcome = "on target" if abs(cy - W / 2) < GOAL_HALF + 0.5 else "off target"
                conf = 0.65 if goal_x - rx < 25 else 0.5
                add(at, "shot", tm, p, outcome=outcome, conf=conf)
                last_shot = at
                continue
        wide = ry < W * 0.22 or ry > W * 0.78
        if wide and rx > L / 6 and at - last_cross > 4 and abs(rvy) > 5:
            # Heading into the middle of the box?
            tt = 1.2
            ex, ey = rx + rvx * tt, ry + rvy * tt
            if ex > L / 2 - BOX_DEPTH - 6 and abs(ey - W / 2) < BOX_HALF:
                nxt = next((owner[x] for x in window(at + 0.6, at + 3) if owner.get(x) and owner[x] != o_), None)
                outcome = "" if nxt is None else ("completed" if nxt[1] == tm else "not completed")
                add(at, "cross", tm, p, outcome=outcome, conf=0.55)
                last_cross = at

    # ---- Box entries and high regains, from who has the ball.
    last_entry = {0: -30.0, 1: -30.0}
    last_regain = -10.0
    prev_team, prev_since, prev_last = None, None, -1e9
    prev_in_box = {0: False, 1: False}
    for ft in times:
        o_ = owner.get(ft)
        b = ball.get(ft)
        if o_ and b is not None and ft in touching:
            tm = o_[1]
            rx, ry = rel(tm, ft, b)
            in_box = rx > L / 2 - BOX_DEPTH and abs(ry - W / 2) < BOX_HALF
            if in_box and not prev_in_box[tm] and ft - last_entry[tm] > 10:
                # kept it for a second
                kept = all(owner_team(x) in (tm, None) for x in window(ft + 1e-3, ft + 1.0))
                if kept:
                    near_cross = any(e["kind"] == "cross" and e["team"] == tm and 0 <= ft - e["t"] <= 3 for e in events)
                    add(ft, "box_entry", tm, b, outcome="cross" if near_cross else "", conf=0.6)
                    last_entry[tm] = ft
            prev_in_box[tm] = in_box
        cur = o_[1] if o_ else None
        if cur is not None and prev_team is not None and cur != prev_team and b is not None:
            held_before = prev_since is not None and ft - prev_since >= 1.5 and ft - prev_last <= 2.0
            held_after = all(owner_team(x) in (cur, None) for x in window(ft + 1e-3, ft + 1.5))
            rx, _ = rel(cur, ft, b)
            after_restart = any(0 <= ft - r_[0] <= 2 for r_ in restarts)
            if held_before and held_after and rx > L / 6 and ft - last_regain > 8 and not after_restart:
                add(ft, "turnover_won", cur, b, outcome="press", conf=0.5)
                last_regain = ft
        if cur is not None and cur != prev_team:
            prev_team, prev_since = cur, ft
        if cur is not None:
            prev_last = ft

    # ---- Kick-offs: the first, and any after the teams change ends, start a half; the rest follow a goal.
    periods, goals = [], []
    for at, tm in kickoffs:
        # A new half when the teams have changed ends since the last half started.
        if not periods or attack_right(int((at + 120) // 60)) != attack_right(int((periods[-1]["start"] + 120) // 60)):
            periods.append({"label": "1st half" if not periods else "2nd half" if len(periods) == 1 else f"Period {len(periods) + 1}", "start": round(at, 1), "base": 45 * len(periods)})
            continue
        if tm is None:
            continue
        scorer = 1 - tm
        # The goal itself: the scoring team's last shot in the 2 minutes before, else when the ball was last in that box.
        shot = next((e for e in reversed(events) if e["kind"] == "shot" and e["team"] == scorer and 0 < at - e["t"] < 120), None)
        if shot:
            shot["outcome"] = "on target"
            gt, gp = shot["t"], None
        else:
            cands = [x for x in window(at - 120, at - 20) if ball.get(x) is not None and rel(scorer, x, ball[x])[0] > L / 2 - BOX_DEPTH]
            if not cands:
                continue
            gt = cands[-1]
            gp = ball[gt]
        if gp is None:
            ev = {**shot, "kind": "goal", "outcome": "", "confidence": 0.7}
            events.append(ev)
        else:
            add(gt, "goal", scorer, gp, conf=0.55)
        goals.append(gt)

    # Sorted, and capped (keeping the surest) in case a noisy video produces a flood.
    events.sort(key=lambda e: e["t"])
    if len(events) > 250:
        events = sorted(events, key=lambda e: -e["confidence"])[:250]
        events.sort(key=lambda e: e["t"])
    return {"events": events, "periods": periods[:4]}
