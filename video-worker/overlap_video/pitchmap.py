"""From rays to positions on the pitch, in metres.

The coach taps a few points they can see on the panorama of the ground (the centre spot, where the
halfway line meets the far touchline, the goals, corners, penalty-box corners). Each tap is a ray from
the camera. We then solve for where the camera stands, how high it is, which way it faces, and (if the
coach doesn't know it) the pitch's length and width, so that every tapped ray hits the right spot.

Pitch coordinates: x along the length (0 at halfway, negative towards the left goal as the camera sees it),
y across (0 on the near touchline, the camera's side; width on the far touchline), z up. Metres.
"""

from __future__ import annotations

import dataclasses

import numpy as np
from scipy.optimize import least_squares
from scipy.spatial.transform import Rotation

CIRCLE = 9.15
BOX_DEPTH, BOX_HALF = 16.5, 20.16
SIX_DEPTH, SIX_HALF = 5.5, 9.16

# Each landmark's position as a function of pitch length L and width W.
LANDMARKS: dict[str, tuple[str, callable]] = {
    "centre_spot": ("Centre spot", lambda L, W: (0, W / 2)),
    "halfway_far": ("Halfway line, far touchline", lambda L, W: (0, W)),
    "halfway_near": ("Halfway line, near touchline", lambda L, W: (0, 0)),
    "circle_far": ("Centre circle, far side", lambda L, W: (0, W / 2 + CIRCLE)),
    "circle_near": ("Centre circle, near side", lambda L, W: (0, W / 2 - CIRCLE)),
    "circle_left": ("Centre circle, left", lambda L, W: (-CIRCLE, W / 2)),
    "circle_right": ("Centre circle, right", lambda L, W: (CIRCLE, W / 2)),
    "goal_left": ("Left goal (middle, on the line)", lambda L, W: (-L / 2, W / 2)),
    "goal_right": ("Right goal (middle, on the line)", lambda L, W: (L / 2, W / 2)),
    "corner_left_far": ("Far left corner", lambda L, W: (-L / 2, W)),
    "corner_right_far": ("Far right corner", lambda L, W: (L / 2, W)),
    "corner_left_near": ("Near left corner", lambda L, W: (-L / 2, 0)),
    "corner_right_near": ("Near right corner", lambda L, W: (L / 2, 0)),
    "box_left_far": ("Left penalty box, far corner (in the field)", lambda L, W: (-L / 2 + BOX_DEPTH, W / 2 + BOX_HALF)),
    "box_left_near": ("Left penalty box, near corner (in the field)", lambda L, W: (-L / 2 + BOX_DEPTH, W / 2 - BOX_HALF)),
    "box_right_far": ("Right penalty box, far corner (in the field)", lambda L, W: (L / 2 - BOX_DEPTH, W / 2 + BOX_HALF)),
    "box_right_near": ("Right penalty box, near corner (in the field)", lambda L, W: (L / 2 - BOX_DEPTH, W / 2 - BOX_HALF)),
}


@dataclasses.dataclass
class PitchModel:
    R: np.ndarray  # reference-camera <- world rotation
    C: np.ndarray  # camera position in pitch metres (x, y, z)
    length: float
    width: float
    error_deg: float  # average disagreement between taps and the solved model
    # The stitched panorama's angles can all be stretched by one factor (the camera's zoom is hard to pin down
    # from a panning, zooming Veo view). `k` undoes it, around the direction (tc, pc) the taps centre on.
    k: float = 1.0  # left/right
    tc: float = 0.0
    pc: float = 0.0
    kv: float = 1.0  # up/down

    def fix(self, rays: np.ndarray, inverse: bool = False) -> np.ndarray:
        if inverse:
            return rescale(np.asarray(rays, float), 1 / self.k, self.tc, self.pc, 1 / self.kv)
        return rescale(np.asarray(rays, float), self.k, self.tc, self.pc, self.kv)

    def to_pitch(self, rays: np.ndarray) -> np.ndarray:
        """Where rays (reference frame) hit the ground, in pitch metres. NaN for rays at or above the horizon."""
        w = (self.R.T @ self.fix(rays).T).T
        s = np.where(w[:, 2] < -1e-6, -self.C[2] / np.where(w[:, 2] < -1e-6, w[:, 2], -1), np.nan)
        return self.C[:2] + w[:, :2] * s[:, None]

    def to_ray(self, pts: np.ndarray) -> np.ndarray:
        """Ray (reference frame) towards ground points in pitch metres."""
        P = np.c_[np.asarray(pts, float), np.zeros(len(pts))]
        v = P - self.C
        r = (self.R @ v.T).T
        return self.fix(r / np.linalg.norm(r, axis=1, keepdims=True), inverse=True)

    def as_dict(self) -> dict:
        return {"R": self.R.tolist(), "C": self.C.tolist(), "length": self.length, "width": self.width, "error_deg": self.error_deg, "k": self.k, "tc": self.tc, "pc": self.pc, "kv": self.kv}

    @staticmethod
    def from_dict(d: dict) -> "PitchModel":
        return PitchModel(np.array(d["R"]), np.array(d["C"]), d["length"], d["width"], d["error_deg"], d.get("k", 1.0), d.get("tc", 0.0), d.get("pc", 0.0), d.get("kv", d.get("k", 1.0)))


def rescale(rays: np.ndarray, k: float, tc: float, pc: float, kv: float | None = None) -> np.ndarray:
    """Stretch rays' angles around the direction (tc, pc): left/right by k, up/down by kv (default k)."""
    kv = k if kv is None else kv
    if k == 1.0 and kv == 1.0:
        return rays
    r = rays / np.linalg.norm(rays, axis=1, keepdims=True)
    th = tc + k * (np.arctan2(r[:, 0], r[:, 2]) - tc)
    ph = pc + kv * (np.arcsin(np.clip(r[:, 1], -1, 1)) - pc)
    return np.c_[np.cos(ph) * np.sin(th), np.sin(ph), np.cos(ph) * np.cos(th)]


def calibrate(taps: dict[str, np.ndarray], length: float | None = None, width: float | None = None) -> PitchModel:
    """Solve the camera and pitch from tapped landmarks: {landmark key: ray}. Needs at least 4 taps
    (5+ if the pitch size isn't given), spread across the pitch."""
    keys = [k for k in taps if k in LANDMARKS]
    if len(keys) < 4:
        raise ValueError("Tap at least 4 points on the pitch.")
    obs = np.array([taps[k] / np.linalg.norm(taps[k]) for k in keys])
    fixL, fixW = length is not None, width is not None
    # Enough taps to also solve the panorama's angle stretch (see PitchModel.k)?
    free_k = len(keys) >= 6
    tc = float(np.mean(np.arctan2(obs[:, 0], obs[:, 2])))
    pc = float(np.mean(np.arcsin(np.clip(obs[:, 1], -1, 1))))

    def unpack(p):
        rv, C = p[:3], p[3:6]
        i = 6
        L = length if fixL else p[i]
        i += 0 if fixL else 1
        W = width if fixW else p[i]
        i += 0 if fixW else 1
        k, kv = (p[i], p[i + 1]) if free_k else (1.0, 1.0)
        return Rotation.from_rotvec(rv).as_matrix(), C, L, W, k, kv

    def resid(p):
        R, C, L, W, k, kv = unpack(p)
        P = np.array([[*LANDMARKS[key][1](L, W), 0.0] for key in keys])
        v = P - C
        r = (R @ v.T).T
        r /= np.linalg.norm(r, axis=1, keepdims=True)
        out = np.cross(r, rescale(obs, k, tc, pc, kv)).ravel()  # ~ angle, for small angles
        # Gentle pull towards a normal-sized pitch, so few taps still give a sensible answer.
        prior = []
        if not fixL:
            prior.append((L - 100) / 400)
        if not fixW:
            prior.append((W - 64) / 300)
        if free_k:
            prior += [(k - 1.0) / 20, (kv - k) / 10]
        return np.r_[out, prior]

    # The reference camera looks roughly along the world's +y (into the pitch), x to the right, y down.
    base = np.array([[1, 0, 0], [0, 0, -1], [0, 1, 0]], float)
    best = None
    # Try a few starting guesses for which way the camera faces and where it stands.
    yaw0 = np.arctan2(np.mean(obs[:, 0]), np.mean(obs[:, 2]))
    for yaw in (yaw0, yaw0 - 0.4, yaw0 + 0.4):
        for h, back in ((6.0, 4.0), (10.0, 8.0), (4.0, 2.0)):
            R0 = Rotation.from_euler("y", yaw).as_matrix() @ Rotation.from_euler("x", -0.25).as_matrix() @ base
            p0 = np.r_[Rotation.from_matrix(R0).as_rotvec(), 0.0, -back, h]
            if not fixL:
                p0 = np.r_[p0, 100.0]
            if not fixW:
                p0 = np.r_[p0, 64.0]
            if free_k:
                p0 = np.r_[p0, 1.0, 1.0]
            lo = np.r_[[-np.pi * 2] * 3, -80, -60, 1.0, [40.0] * (not fixL), [25.0] * (not fixW), [0.4, 0.4] * free_k]
            hi = np.r_[[np.pi * 2] * 3, 80, 0, 40.0, [130.0] * (not fixL), [100.0] * (not fixW), [1.6, 1.6] * free_k]
            try:
                res = least_squares(resid, p0, bounds=(lo, hi), loss="soft_l1", f_scale=0.01)
            except ValueError:
                continue
            if best is None or res.cost < best.cost:
                best = res
    R, C, L, W, k, kv = unpack(best.x)
    m = PitchModel(R, C, float(L), float(W), 0.0, float(k), tc, pc, float(kv))
    pred = m.to_ray(np.array([LANDMARKS[key][1](L, W) for key in keys]))
    m.error_deg = float(np.degrees(np.mean(np.arccos(np.clip((pred * obs).sum(1), -1, 1)))))
    return m


def pitch_lines(L: float, W: float, n: int = 60) -> list[np.ndarray]:
    """The standard markings as polylines (pitch metres), for drawing checks."""
    hl, out = L / 2, []
    seg = lambda a, b: np.linspace(a, b, n)
    out.append(seg((-hl, 0), (hl, 0)))
    out.append(seg((-hl, W), (hl, W)))
    out.append(seg((-hl, 0), (-hl, W)))
    out.append(seg((hl, 0), (hl, W)))
    out.append(seg((0, 0), (0, W)))
    t = np.linspace(0, 2 * np.pi, n)
    out.append(np.c_[CIRCLE * np.cos(t), W / 2 + CIRCLE * np.sin(t)])
    for sgn in (-1, 1):
        gx = sgn * hl
        bx = gx - sgn * BOX_DEPTH
        out.append(np.array([(gx, W / 2 - BOX_HALF), (bx, W / 2 - BOX_HALF), (bx, W / 2 + BOX_HALF), (gx, W / 2 + BOX_HALF)]))
        sx = gx - sgn * SIX_DEPTH
        out.append(np.array([(gx, W / 2 - SIX_HALF), (sx, W / 2 - SIX_HALF), (sx, W / 2 + SIX_HALF), (gx, W / 2 + SIX_HALF)]))
    return out
