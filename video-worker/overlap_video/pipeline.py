"""Overlap match video analysis.

Turns a match video (e.g. a Veo follow-cam MP4) into team-level stats:
who had the ball (possession), how that changed through the game, and the
two teams' shirt colours so the coach can say which one is theirs.

Building blocks (all permissively licensed, safe for a paid product):
  * RF-DETR (Apache-2.0 code and Nano–Large weights) for people and the ball
  * trackers (Apache-2.0) for ByteTrack tracking, supervision (MIT) for detection data
  * scikit-learn (BSD) for grouping shirt colours into teams

Nothing here identifies people: tracks are anonymous boxes, and only numbers leave this module.
"""

from __future__ import annotations

import dataclasses
import math
from collections import defaultdict
from typing import Callable, Iterator

import cv2
import numpy as np

PERSON = "person"
BALL = "sports ball"


@dataclasses.dataclass
class Settings:
    sample_fps: float = 5.0  # frames analysed per second of video
    model_size: str = "medium"  # nano | small | medium | large (all Apache-2.0)
    person_threshold: float = 0.35
    ball_threshold: float = 0.25
    max_width: int = 1280  # frames are scaled down to this before detection
    possession_reach: float = 0.9  # ball within this many player-heights of a player's feet = theirs
    min_track_seconds: float = 2.0  # shorter tracks are ignored for team colours
    max_seconds: float | None = None  # analyse only the first N seconds (testing)


def load_model(size: str):
    import rfdetr

    cls = {"nano": rfdetr.RFDETRNano, "small": rfdetr.RFDETRSmall, "medium": rfdetr.RFDETRMedium, "large": rfdetr.RFDETRLarge}[size]
    return cls()


def frames(path: str, s: Settings) -> Iterator[tuple[float, np.ndarray]]:
    """Yield (seconds, BGR frame) at roughly s.sample_fps."""
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        raise RuntimeError("Couldn't open the video. Is it an MP4?")
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    step = max(1, round(fps / s.sample_fps))
    i = 0
    try:
        while True:
            ok = cap.grab()
            if not ok:
                break
            if i % step == 0:
                ok, frame = cap.retrieve()
                if not ok:
                    break
                t = i / fps
                if s.max_seconds is not None and t > s.max_seconds:
                    break
                h, w = frame.shape[:2]
                if w > s.max_width:
                    frame = cv2.resize(frame, (s.max_width, round(h * s.max_width / w)), interpolation=cv2.INTER_AREA)
                yield t, frame
            i += 1
    finally:
        cap.release()


def video_info(path: str) -> dict:
    cap = cv2.VideoCapture(path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    n = cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0
    w, h = cap.get(cv2.CAP_PROP_FRAME_WIDTH), cap.get(cv2.CAP_PROP_FRAME_HEIGHT)
    cap.release()
    return {"fps": fps, "frames": int(n), "seconds": n / fps if fps else 0, "width": int(w), "height": int(h)}


# ---------------------------------------------------------------- pitch and shirts


def grass_mask(frame: np.ndarray) -> np.ndarray:
    """Pixels that look like grass (works for natural and most artificial turf)."""
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    return cv2.inRange(hsv, (30, 40, 40), (90, 255, 255))


def on_pitch(box: np.ndarray, grass: np.ndarray) -> bool:
    """Is this person standing on grass? Filters out spectators, coaches and parents on the sideline."""
    x1, y1, x2, y2 = box.astype(int)
    h, w = grass.shape
    fy = min(h - 1, max(0, y2 + 2))
    xa, xb = max(0, x1), min(w, x2)
    if xb <= xa:
        return False
    band = grass[max(0, fy - 3) : min(h, fy + 6), xa:xb]
    return band.size > 0 and band.mean() / 255 > 0.35


def shirt_colour(frame: np.ndarray, box: np.ndarray) -> np.ndarray | None:
    """Median colour (Lab) of the shirt area, ignoring grass showing through."""
    x1, y1, x2, y2 = box.astype(int)
    bw, bh = x2 - x1, y2 - y1
    if bh < 18 or bw < 6:
        return None
    ya, yb = y1 + int(0.18 * bh), y1 + int(0.5 * bh)
    xa, xb = x1 + int(0.25 * bw), x2 - int(0.25 * bw)
    crop = frame[max(0, ya) : yb, max(0, xa) : xb]
    if crop.size == 0:
        return None
    keep = grass_mask(crop) == 0
    if keep.sum() < 12:
        return None
    lab = cv2.cvtColor(crop, cv2.COLOR_BGR2LAB)[keep]
    return np.median(lab, axis=0).astype(np.float32)


def lab_to_hex(lab: np.ndarray) -> str:
    px = np.uint8([[np.clip(lab, 0, 255)]])
    b, g, r = cv2.cvtColor(px, cv2.COLOR_LAB2BGR)[0, 0]
    return f"#{r:02x}{g:02x}{b:02x}"


# ---------------------------------------------------------------- the analysis


def analyse(path: str, s: Settings | None = None, progress: Callable[[float, str], None] | None = None, model=None, debug_dir: str | None = None) -> dict:
    from trackers import ByteTrackTracker

    s = s or Settings()
    info = video_info(path)
    total = min(info["seconds"], s.max_seconds) if s.max_seconds else info["seconds"]
    say = progress or (lambda p, m: None)
    say(0.01, "Loading the model")
    model = model or load_model(s.model_size)
    names = model.class_names
    pid, bid = names.index(PERSON), names.index(BALL)

    tracker = ByteTrackTracker(frame_rate=s.sample_fps, lost_track_buffer=round(2 * s.sample_fps), track_activation_threshold=0.45, high_conf_det_threshold=0.5, minimum_consecutive_frames=2)
    track_colours: dict[int, list[np.ndarray]] = defaultdict(list)
    track_seen: dict[int, list[float]] = defaultdict(list)
    # Per analysed frame: (t, ball centre or None, [(track_id, foot_x, foot_y, height)])
    timeline: list[tuple[float, tuple[float, float] | None, list[tuple[int, float, float, float]]]] = []
    ball_frames = 0
    n = 0
    snaps: list[tuple[np.ndarray, list, tuple | None]] = []  # a few frames kept for the debug pictures

    for t, frame in frames(path, s):
        det = model.predict(np.ascontiguousarray(frame[:, :, ::-1]), threshold=min(s.person_threshold, s.ball_threshold))
        cls = det.class_id if det.class_id is not None else np.zeros(len(det), int)
        conf = det.confidence if det.confidence is not None else np.ones(len(det))
        grass = grass_mask(frame)

        people = det[(cls == pid) & (conf >= s.person_threshold)]
        people = people[np.array([on_pitch(b, grass) for b in people.xyxy], dtype=bool)] if len(people) else people
        people = tracker.update(people, frame=frame, timestamp=t)
        if people.tracker_id is None:
            people.tracker_id = np.full(len(people), -1)
        people = people[people.tracker_id >= 0]

        balls = det[(cls == bid) & (conf >= s.ball_threshold)]
        ball = None
        if len(balls):
            b = balls.xyxy[int(np.argmax(balls.confidence))]
            ball = ((b[0] + b[2]) / 2, (b[1] + b[3]) / 2)
            ball_frames += 1

        players = []
        for box, tid in zip(people.xyxy, people.tracker_id):
            tid = int(tid)
            track_seen[tid].append(t)
            if len(track_colours[tid]) < 40 and n % 2 == 0:
                c = shirt_colour(frame, box)
                if c is not None:
                    track_colours[tid].append(c)
            players.append((tid, float((box[0] + box[2]) / 2), float(box[3]), float(box[3] - box[1])))
        timeline.append((t, ball, players))
        if debug_dir and n % 50 == 10 and len(snaps) < 8:
            snaps.append((frame.copy(), [(int(tid), b.copy()) for b, tid in zip(people.xyxy, people.tracker_id)], ball))
        n += 1
        if n % 25 == 0:
            say(min(0.9, 0.02 + 0.88 * t / max(total, 1)), f"Analysed {int(t // 60)}:{int(t % 60):02d} of the video")

    say(0.92, "Working out the teams")
    teams, team_of = assign_teams(track_colours, track_seen, s)
    say(0.96, "Adding up possession")
    poss = possession(timeline, team_of, s)
    if debug_dir:
        draw_debug(debug_dir, snaps, teams, team_of)

    return {
        "version": 1,
        "video": {**info, "analysed_seconds": round(total, 1), "sample_fps": s.sample_fps, "frames_analysed": n},
        "quality": {
            "ball_seen_pct": round(100 * ball_frames / max(n, 1), 1),
            "players_per_frame": round(float(np.mean([len(p) for _, _, p in timeline])) if timeline else 0, 1),
            "tracks": len(track_seen),
        },
        "teams": teams,
        "possession": poss,
    }


def assign_teams(track_colours, track_seen, s: Settings):
    """Group long-enough tracks into two teams by shirt colour. Referees and keepers usually end up as 'other'."""
    from sklearn.cluster import KMeans

    rows, ids, weights = [], [], []
    for tid, cols in track_colours.items():
        seen = track_seen[tid]
        if len(cols) >= 3 and (seen[-1] - seen[0]) >= s.min_track_seconds:
            rows.append(np.median(np.stack(cols), axis=0))
            ids.append(tid)
            weights.append(len(seen))
    if len(rows) < 4:
        return [], {}
    X = np.stack(rows)
    km = KMeans(n_clusters=2, n_init=10, random_state=0).fit(X, sample_weight=weights)
    d = np.linalg.norm(X - km.cluster_centers_[km.labels_], axis=1)
    # Far from both team colours (e.g. referee in black, keepers): not counted for either team.
    cut = max(18.0, float(np.percentile(d, 85)) * 1.5)
    team_of = {tid: (int(lab) if dist <= cut else -1) for tid, lab, dist in zip(ids, km.labels_, d)}
    teams = []
    for k in (0, 1):
        members = [t for t, lab in team_of.items() if lab == k]
        teams.append({"key": k, "colour": lab_to_hex(km.cluster_centers_[k]), "tracks": len(members), "presence": int(sum(len(track_seen[t]) for t in members))})
    return teams, team_of


def possession(timeline, team_of, s: Settings):
    """Who was closest to the ball, frame by frame, smoothed so brief misreads don't flip possession."""
    raw = []
    for t, ball, players in timeline:
        owner = None
        if ball is not None and players:
            best, best_d = None, math.inf
            for tid, fx, fy, h in players:
                if team_of.get(tid, -1) < 0:
                    continue
                d = math.hypot(fx - ball[0], fy - ball[1]) / max(h, 1.0)
                if d < best_d:
                    best, best_d = tid, d
            if best is not None and best_d <= s.possession_reach:
                owner = team_of[best]
        raw.append((t, owner))

    # Carry possession through short gaps (passes, ball hidden) of up to 3 seconds.
    smooth, last, last_t = [], None, -1e9
    for t, o in raw:
        if o is not None:
            last, last_t = o, t
            smooth.append((t, o))
        elif last is not None and t - last_t <= 3.0:
            smooth.append((t, last))
        else:
            smooth.append((t, None))

    dt = 1.0 / s.sample_fps
    tot = [0.0, 0.0]
    per_min: dict[int, list[float]] = defaultdict(lambda: [0.0, 0.0])
    for t, o in smooth:
        if o is not None:
            tot[o] += dt
            per_min[int(t // 60)][o] += dt
    known = sum(tot)
    pct = [round(100 * x / known, 1) if known else 0.0 for x in tot]
    by_5 = []
    for m0 in range(0, (max(per_min) + 1) if per_min else 0, 5):
        a = sum(per_min[m][0] for m in range(m0, m0 + 5) if m in per_min)
        b = sum(per_min[m][1] for m in range(m0, m0 + 5) if m in per_min)
        by_5.append({"from_min": m0, "team0_pct": round(100 * a / (a + b), 1) if a + b else None, "seconds": round(a + b, 1)})
    return {"pct": pct, "seconds_with_owner": round(known, 1), "by_5_min": by_5}


def draw_debug(folder: str, snaps, teams, team_of):
    """Save a few frames with boxes coloured by team, to check the analysis by eye."""
    import os

    os.makedirs(folder, exist_ok=True)
    col = {t["key"]: tuple(int(t["colour"][i : i + 2], 16) for i in (5, 3, 1)) for t in teams}
    for i, (frame, boxes, ball) in enumerate(snaps):
        img = frame.copy()
        for tid, b in boxes:
            k = team_of.get(tid)
            c = col.get(k, (128, 128, 128)) if k is not None and k >= 0 else (0, 0, 255)
            x1, y1, x2, y2 = b.astype(int)
            cv2.rectangle(img, (x1, y1), (x2, y2), (255, 255, 255), 3)
            cv2.rectangle(img, (x1, y1), (x2, y2), c, 2)
            cv2.putText(img, f"{tid}{'' if k is None else ' T' + str(k) if k >= 0 else ' ?'}", (x1, y1 - 3), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1)
        if ball is not None:
            cv2.circle(img, (int(ball[0]), int(ball[1])), 9, (0, 255, 255), 2)
        cv2.imwrite(os.path.join(folder, f"frame-{i}.jpg"), img)
