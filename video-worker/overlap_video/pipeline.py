"""Overlap match video analysis.

Turns a match video (e.g. a Veo follow-cam MP4) into team-level stats:
who had the ball (possession), how that changed through the game, and the
two teams' shirt colours so the coach can say which one is theirs.

Building blocks (all permissively licensed, safe for a paid product):
  * RF-DETR (Apache-2.0 code and Nano–Large weights) for people and the ball
  * trackers (Apache-2.0) for BoT-SORT tracking with camera-motion compensation, supervision (MIT) for detection data
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

from .camera import WORK_WIDTH

# RF-DETR's COCO models report the original COCO category ids (not positions in class_names).
PERSON_ID = 1
BALL_ID = 37


@dataclasses.dataclass
class Settings:
    sample_fps: float = 5.0  # frames analysed per second of video
    model_size: str = "medium"  # nano | small | medium | large (all Apache-2.0)
    person_threshold: float = 0.35
    ball_threshold: float = 0.25
    max_width: int = 1920  # frames are scaled down to this before detection
    # Also look at the far side of the pitch in close-up sections, so far-away players (only a few
    # pixels tall once the whole frame is shrunk for the model) are found too. About 4x the work.
    tiles: bool = True
    # Read shirt numbers so stats can be given per player (needs easyocr).
    numbers: bool = True
    gpu: bool = False
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


class Pitch:
    """Learns what the playing surface looks like in this video (green, dry and brown, or artificial turf),
    and where the field is in each frame, so spectators and benches beyond it are ignored."""

    def __init__(self):
        self.colour: np.ndarray | None = None  # Lab

    def learn(self, frame: np.ndarray) -> None:
        h, w = frame.shape[:2]
        # The lower middle of a match camera's view is almost always playing surface.
        patch = frame[int(h * 0.55) : int(h * 0.9), int(w * 0.2) : int(w * 0.8)]
        lab = cv2.cvtColor(patch, cv2.COLOR_BGR2LAB).reshape(-1, 3).astype(np.float32)
        c = np.median(lab, axis=0)
        self.colour = c if self.colour is None else 0.9 * self.colour + 0.1 * c

    def mask(self, frame: np.ndarray) -> np.ndarray:
        """255 where a pixel looks like the playing surface."""
        if self.colour is None:
            self.learn(frame)
        lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB).astype(np.float32)
        d = lab - self.colour
        # Lightness varies a lot with sun and shadow; colour (a, b) much less.
        dist = np.sqrt(0.15 * d[..., 0] ** 2 + d[..., 1] ** 2 + d[..., 2] ** 2)
        return np.where(dist < 14, 255, 0).astype(np.uint8)

    def field(self, mask: np.ndarray) -> np.ndarray:
        """The field area: the biggest patch of surface, filled in (players and lines become part of it)."""
        small = cv2.resize(mask, (mask.shape[1] // 4, mask.shape[0] // 4), interpolation=cv2.INTER_AREA)
        small = cv2.morphologyEx(small, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
        n, labels, stats, _ = cv2.connectedComponentsWithStats((small > 127).astype(np.uint8))
        out = np.zeros_like(small)
        if n > 1:
            k = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
            cnts, _ = cv2.findContours((labels == k).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            if cnts:
                cv2.fillPoly(out, [cv2.convexHull(max(cnts, key=cv2.contourArea))], 255)
        out = cv2.resize(out, (mask.shape[1], mask.shape[0]), interpolation=cv2.INTER_NEAREST)
        # Pull the edge in a little, so people standing right on the fence line don't count.
        k = max(3, mask.shape[0] // 80)
        return cv2.erode(out, np.ones((k, k), np.uint8))


def on_pitch(box: np.ndarray, field: np.ndarray) -> bool:
    """Are this person's feet inside the field? Filters out spectators, coaches and parents beyond the lines."""
    x1, y1, x2, y2 = box.astype(int)
    h, w = field.shape
    fx, fy = min(w - 1, max(0, (x1 + x2) // 2)), min(h - 1, max(0, y2))
    return bool(field[fy, fx])


def shirt_colour(frame: np.ndarray, box: np.ndarray, surface: np.ndarray) -> np.ndarray | None:
    """Median colour (Lab) of the shirt area, ignoring pitch showing through."""
    x1, y1, x2, y2 = box.astype(int)
    bw, bh = x2 - x1, y2 - y1
    if bh < 18 or bw < 6:
        return None
    ya, yb = y1 + int(0.18 * bh), y1 + int(0.5 * bh)
    xa, xb = x1 + int(0.25 * bw), x2 - int(0.25 * bw)
    ya, xa = max(0, ya), max(0, xa)
    crop = frame[ya:yb, xa:xb]
    if crop.size == 0:
        return None
    keep = surface[ya:yb, xa:xb] == 0
    if keep.sum() < 12:
        return None
    lab = cv2.cvtColor(crop, cv2.COLOR_BGR2LAB)[keep]
    return np.median(lab, axis=0).astype(np.float32)


def lab_to_hex(lab: np.ndarray) -> str:
    px = np.uint8([[np.clip(lab, 0, 255)]])
    b, g, r = cv2.cvtColor(px, cv2.COLOR_LAB2BGR)[0, 0]
    return f"#{r:02x}{g:02x}{b:02x}"


# ---------------------------------------------------------------- the analysis


def analyse(path: str, s: Settings | None = None, progress: Callable[[float, str], None] | None = None, model=None, debug_dir: str | None = None, data_path: str | None = None) -> dict:
    """Analyse a match video. If `data_path` is given, everyone's positions (as camera rays) are saved there,
    so the pitch can be mapped later once the coach has tapped a few points (see mapping.py)."""
    from trackers import BoTSORTTracker

    from .camera import Registrar

    s = s or Settings()
    info = video_info(path)
    total = min(info["seconds"], s.max_seconds) if s.max_seconds else info["seconds"]
    say = progress or (lambda p, m: None)
    say(0.01, "Loading the model")
    model = model or load_model(s.model_size)
    pid, bid = PERSON_ID, BALL_ID

    pitch = Pitch()
    # BoT-SORT with camera-motion compensation: Veo pans a lot, and without it small far-away players move
    # further between frames than their own size, so they'd never be linked into tracks.
    tracker = BoTSORTTracker(
        frame_rate=s.sample_fps,
        lost_track_buffer=round(2 * s.sample_fps),
        track_activation_threshold=0.45,
        high_conf_det_threshold=0.5,
        minimum_consecutive_frames=2,
        enable_cmc=True,
        cmc_method="sparseOptFlow",
    )
    track_colours: dict[int, list[np.ndarray]] = defaultdict(list)
    track_seen: dict[int, list[float]] = defaultdict(list)
    # Per analysed frame: (t, ball centre or None, [(track_id, foot_x, foot_y, height, shirt colour or None)])
    timeline: list[tuple[float, tuple[float, float] | None, list[tuple]]] = []
    ball_frames = 0
    n = 0
    snaps: list[tuple[np.ndarray, list, tuple | None]] = []  # a few frames kept for the debug pictures
    reg = Registrar()  # where the camera is looking, frame by frame
    reader = None
    if s.numbers:
        from .numbers import NumberReader

        reader = NumberReader(gpu=s.gpu)
    views: list[tuple[int, np.ndarray, float]] = []

    for t, frame in frames(path, s):
        if n % 25 == 0:
            pitch.learn(frame)
        surface = pitch.mask(frame)
        field = pitch.field(surface)
        det = detect(model, frame, field, min(s.person_threshold, s.ball_threshold), s.tiles)
        cls = det.class_id if det.class_id is not None else np.zeros(len(det), int)
        conf = det.confidence if det.confidence is not None else np.ones(len(det))

        people = det[(cls == pid) & (conf >= s.person_threshold)]
        fh = frame.shape[0]
        if len(people):
            keep = []
            for b in people.xyxy:
                w_, h_ = b[2] - b[0], b[3] - b[1]
                # Standing on the field, upright (not sitting or crouching), and not cut off right by the camera.
                keep.append(on_pitch(b, field) and h_ > 1.4 * w_ and b[3] < 0.97 * fh)
            people = people[np.array(keep, dtype=bool)]
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
            c = shirt_colour(frame, box, surface)
            if c is not None and len(track_colours[tid]) < 60:
                track_colours[tid].append(c)
            players.append((tid, float((box[0] + box[2]) / 2), float(box[3]), float(box[3] - box[1]), c))
            if reader is not None:
                reader.maybe_read(tid, t, frame, box)
        timeline.append((t, ball, players))
        try:
            k, H = reg.add(t, frame)
            views.append((k, H, WORK_WIDTH / frame.shape[1]))
        except cv2.error:
            views.append((-1, np.eye(3), 1.0))
        if debug_dir and n % 50 == 10 and len(snaps) < 8:
            snaps.append((frame.copy(), [(p[0], b.copy(), p[4]) for b, p in zip(people.xyxy, players)], ball))
        n += 1
        if n % 25 == 0:
            say(min(0.9, 0.02 + 0.88 * t / max(total, 1)), f"Analysed {int(t // 60)}:{int(t % 60):02d} of the video")

    say(0.92, "Working out the teams")
    teams, team_of, centres = assign_teams(track_colours, track_seen, s)
    say(0.96, "Adding up possession")
    poss, on_ball = possession(timeline, team_of, centres, s)
    numbers = {tid: n for tid in track_seen if reader is not None and (n := reader.number_of(tid)) is not None}
    people_stats = player_summary(track_seen, team_of, numbers, on_ball, s)
    if debug_dir:
        draw_debug(debug_dir, snaps, teams, team_of, centres)
    say(0.97, "Working out where the camera was looking")
    pitch_view = camera_rays(reg, timeline, views, team_of, centres, data_path, numbers)

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
        "players": people_stats,
        "pitch_view": pitch_view,
    }


def player_summary(track_seen, team_of, numbers, on_ball, s: Settings) -> list[dict]:
    """Per player, identified by team and shirt number: how long they were seen and on the ball."""
    dt = 1.0 / s.sample_fps
    agg: dict[tuple[int, int], dict] = {}
    for tid, num in numbers.items():
        team = team_of.get(tid, -1)
        if team < 0:
            continue
        a = agg.setdefault((team, num), {"team": team, "number": num, "seen_s": 0.0, "on_ball_s": 0.0, "tracks": 0})
        a["seen_s"] += len(track_seen[tid]) * dt
        a["on_ball_s"] += on_ball.get(tid, 0.0)
        a["tracks"] += 1
    out = [dict(v, seen_s=round(v["seen_s"]), on_ball_s=round(v["on_ball_s"], 1)) for v in agg.values() if v["seen_s"] >= 10]
    return sorted(out, key=lambda x: (x["team"], x["number"]))


def camera_rays(reg, timeline, views, team_of, centres, data_path, numbers=None):
    """Solve the camera for the whole video, save everyone's position as a ray, and make the panorama
    the coach taps pitch points on. Returns what the app needs to show the panorama (or why it couldn't)."""
    import base64

    from .camera import rays, render_pano, solve_cameras

    try:
        solve_cameras(reg.keys)
    except Exception as e:  # mapping is a bonus; the team stats still stand
        return {"error": f"Couldn't work out the camera: {str(e)[:120]}"}
    rows = []
    for (t, ball, players), (k, H, sc) in zip(timeline, views):
        if k < 0 or reg.keys[k].R is None:
            continue
        pts = [(p[1] * sc, p[2] * sc) for p in players] + ([(ball[0] * sc, ball[1] * sc)] if ball else [])
        if not pts:
            continue
        r = rays(reg.keys[k], H, np.array(pts))
        for p, rr in zip(players, r):
            rows.append((t, p[0], team_for(p[0], p[4], team_of, centres), rr[0], rr[1], rr[2], 0, (numbers or {}).get(p[0], -1)))
        if ball:
            rows.append((t, -1, -1, *r[-1], 1, -1))
    if not rows:
        return {"error": "Couldn't place anyone on the pitch."}
    if data_path:
        np.savez_compressed(data_path, rows=np.array(rows, dtype=np.float32))
    pano, info = render_pano(reg.keys, 1600)
    ok, jpg = cv2.imencode(".jpg", pano, [cv2.IMWRITE_JPEG_QUALITY, 78])
    return {"pano_jpeg": base64.b64encode(jpg.tobytes()).decode() if ok else None, "pano": info, "keyframes": len(reg.keys), "placed": sum(k.R is not None for k in reg.keys), "points": len(rows)}


def detect(model, frame: np.ndarray, field: np.ndarray, threshold: float, tiles: bool):
    """People and the ball in one frame. With `tiles`, the far part of the pitch (the top of the field area,
    where players are smallest) is also checked in three overlapping close-ups, and the results merged."""
    import supervision as sv

    rgb = np.ascontiguousarray(frame[:, :, ::-1])
    if not tiles:
        return model.predict(rgb, threshold=threshold, include_source_image=False)
    h, w = frame.shape[:2]
    rows = np.where(field.any(axis=1))[0]
    top = int(rows[0]) if len(rows) else int(h * 0.2)
    # The far band: from just above the far touchline down to about 40% of the frame below it.
    y0, y1 = max(0, top - int(0.06 * h)), min(h, top + int(0.4 * h))
    tw = int(w * 0.4)
    xs = [0, (w - tw) // 2, w - tw]
    crops = [rgb[y0:y1, x : x + tw] for x in xs]
    outs = model.predict([rgb] + crops, threshold=threshold, include_source_image=False)
    parts = [outs[0]]
    for x, d in zip(xs, outs[1:]):
        if len(d):
            d.xyxy = d.xyxy + np.array([x, y0, x, y0], dtype=d.xyxy.dtype)
            parts.append(d)
    merged = sv.Detections.merge(parts)
    return merged.with_nms(threshold=0.5, class_agnostic=False) if len(merged) else merged


def assign_teams(track_colours, track_seen, s: Settings):
    """Find the two teams among everyone tracked on the field.

    Shirt colours are grouped into several clusters. The two teams are the two biggest clusters
    (by how much they're seen) whose colours are clearly different from each other. Referees, keepers,
    coaches and spectators near the line usually land in the smaller clusters and count as 'other'."""
    from sklearn.cluster import KMeans

    rows, ids, weights = [], [], []
    for tid, cols in track_colours.items():
        seen = track_seen[tid]
        if len(cols) >= 3 and (seen[-1] - seen[0]) >= s.min_track_seconds:
            rows.append(np.median(np.stack(cols), axis=0))
            ids.append(tid)
            weights.append(len(seen))
    if len(rows) < 6:
        return [], {}, {}
    X = np.stack(rows)
    W = np.array(weights, dtype=float)
    k = min(5, len(rows) // 3)
    km = KMeans(n_clusters=k, n_init=10, random_state=0).fit(X, sample_weight=W)
    mass = np.array([W[km.labels_ == c].sum() for c in range(k)])
    order = list(np.argsort(-mass))
    first = order[0]
    # The second team: the next-biggest cluster whose colour is clearly different from the first.
    second = next((c for c in order[1:] if np.linalg.norm(km.cluster_centers_[c] - km.cluster_centers_[first]) > 25), None)
    if second is None:
        return [], {}, {}
    centres = {0: km.cluster_centers_[first], 1: km.cluster_centers_[second]}
    team_of = {}
    # Each track's team is a vote over all its frames: far-away players are small, so any one frame's
    # colour can be off (background creeping in), but most frames agree.
    for tid, cols in track_colours.items():
        votes = [classify(c, centres) for c in cols]
        votes = [v for v in votes if v >= 0]
        if len(votes) >= 2:
            best = max((0, 1), key=votes.count)
            if votes.count(best) >= 0.65 * len(votes):
                team_of[tid] = best
                continue
        if tid in ids:
            team_of[tid] = -1
    teams = []
    for t in (0, 1):
        members = [i for i, lab in team_of.items() if lab == t]
        teams.append({"key": t, "colour": lab_to_hex(centres[t]), "tracks": len(members), "presence": int(sum(len(track_seen[i]) for i in members))})
    return teams, team_of, centres


def classify(colour, centres, close: float = 28.0) -> int:
    """Which team a shirt colour belongs to: 0, 1, or -1 if it's neither (referee, keeper, spectator)."""
    if colour is None or not centres:
        return -1
    d = {t: float(np.linalg.norm(colour - c)) for t, c in centres.items()}
    t = min(d, key=d.get)
    # Must be close to that team's colour, and clearly closer to it than to the other team.
    return t if d[t] < close and d[t] < 0.7 * d[1 - t] else -1


def team_for(tid, colour, team_of, centres) -> int:
    """A player's team from their track if it's known, otherwise from this frame's shirt colour
    (tracks restart when the camera pans quickly, and new tracks don't have a team yet)."""
    t = team_of.get(tid)
    if t is not None:
        return t
    return classify(colour, centres, close=24.0)


def possession(timeline, team_of, centres, s: Settings):
    """Who was closest to the ball, frame by frame, smoothed so brief misreads don't flip possession."""
    raw = []
    on_ball: dict[int, float] = defaultdict(float)
    dt = 1.0 / s.sample_fps
    for t, ball, players in timeline:
        owner = None
        if ball is not None and players:
            best, best_d = None, math.inf
            for tid, fx, fy, h, col in players:
                if team_for(tid, col, team_of, centres) < 0:
                    continue
                d = math.hypot(fx - ball[0], fy - ball[1]) / max(h, 1.0)
                if d < best_d:
                    best, best_d = tid, d
            if best is not None and best_d <= s.possession_reach:
                owner = next(team_for(tid, col, team_of, centres) for tid, fx, fy, h, col in players if tid == best)
                on_ball[best] += dt
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
    return {"pct": pct, "seconds_with_owner": round(known, 1), "by_5_min": by_5}, on_ball


def draw_debug(folder: str, snaps, teams, team_of, centres):
    """Save a few frames with boxes coloured by team, to check the analysis by eye."""
    import os

    os.makedirs(folder, exist_ok=True)
    col = {t["key"]: tuple(int(t["colour"][i : i + 2], 16) for i in (5, 3, 1)) for t in teams}
    for i, (frame, boxes, ball) in enumerate(snaps):
        img = frame.copy()
        for tid, b, colr in boxes:
            k = team_for(tid, colr, team_of, centres)
            c = col.get(k, (128, 128, 128)) if k is not None and k >= 0 else (0, 0, 255)
            x1, y1, x2, y2 = b.astype(int)
            cv2.rectangle(img, (x1, y1), (x2, y2), (255, 255, 255), 3)
            cv2.rectangle(img, (x1, y1), (x2, y2), c, 2)
            cv2.putText(img, f"{tid}{' T' + str(k) if k >= 0 else ' ?'}", (x1, y1 - 3), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1)
        if ball is not None:
            cv2.circle(img, (int(ball[0]), int(ball[1])), 9, (0, 255, 255), 2)
        cv2.imwrite(os.path.join(folder, f"frame-{i}.jpg"), img)
