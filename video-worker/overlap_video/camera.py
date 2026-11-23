"""Where the camera is looking, frame by frame.

A Veo "follow-cam" video is a virtual camera that pans and zooms around one fixed panoramic recording.
So every frame is the same camera centre, just rotated and zoomed. We estimate that rotation and zoom
from the background (trees, fences, buildings), with no training, using OpenCV's stitching tools:

  * keyframes: frames that show a new part of the ground, picked as the video plays
  * bundle adjustment: a rotation and focal length for each keyframe, all consistent with each other
  * every other frame is matched to its nearest keyframe

Then any pixel in any frame becomes a ray (a direction from the camera), and `Pitch` (see pitchmap.py)
turns rays into positions on the pitch in metres once the coach has tapped a few known points.
"""

from __future__ import annotations

import dataclasses
import math

import cv2
import numpy as np

WORK_WIDTH = 960  # frames are matched at this width (pixels in other sizes are scaled to it)


@dataclasses.dataclass
class Keyframe:
    t: float
    image: np.ndarray  # BGR at WORK_WIDTH
    K: np.ndarray | None = None  # 3x3
    R: np.ndarray | None = None  # 3x3, camera <- reference


def static_overlay_mask(shape) -> np.ndarray:
    """Ignore the Veo logo (bottom right): it doesn't move with the view, so it would fool the matching."""
    h, w = shape[:2]
    m = np.full((h, w), 255, np.uint8)
    m[int(h * 0.86) :, int(w * 0.82) :] = 0
    return m


def small(frame: np.ndarray) -> tuple[np.ndarray, float]:
    h, w = frame.shape[:2]
    s = WORK_WIDTH / w
    return (cv2.resize(frame, (WORK_WIDTH, round(h * s)), interpolation=cv2.INTER_AREA) if s != 1 else frame), s


class Registrar:
    """Matches a frame to the keyframes and picks new keyframes as the view moves into new areas."""

    def __init__(self, min_overlap: float = 0.55):
        self.orb = cv2.ORB_create(2500, fastThreshold=12)
        self.bf = cv2.BFMatcher(cv2.NORM_HAMMING)
        self.keys: list[Keyframe] = []
        self.feats: list[tuple] = []
        self.thumbs: list[np.ndarray] = []
        self.min_overlap = min_overlap
        self.last = 0

    def _features(self, img):
        g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        return self.orb.detectAndCompute(g, static_overlay_mask(img.shape))

    def homography(self, f1, f2):
        """Homography taking points in image 1 to image 2, and the share of matches that agree."""
        k1, d1 = f1
        k2, d2 = f2
        if d1 is None or d2 is None or len(k1) < 20 or len(k2) < 20:
            return None, 0.0
        pairs = self.bf.knnMatch(d1, d2, k=2)
        good = [m for m, n in (p for p in pairs if len(p) == 2) if m.distance < 0.75 * n.distance]
        if len(good) < 25:
            return None, 0.0
        a = np.float32([k1[m.queryIdx].pt for m in good])
        b = np.float32([k2[m.trainIdx].pt for m in good])
        H, inl = cv2.findHomography(a, b, cv2.RANSAC, 3.0)
        if H is None:
            return None, 0.0
        return H, float(inl.sum()) / max(len(good), 1)

    def add(self, t: float, frame: np.ndarray) -> tuple[int, np.ndarray] | None:
        """Register a frame: returns (keyframe index, homography frame->keyframe), adding a keyframe if needed."""
        img, _ = small(frame)
        f = self._features(img)
        th = thumb(img)
        if not self.keys:
            self._keep(t, img, f, th)
            return 0, np.eye(3)
        # Try the last keyframe first, then the ones that look most alike (so returning views are recognised).
        sim = np.array([float((th * k).mean()) for k in self.thumbs])
        order = [self.last] + [int(i) for i in np.argsort(-sim) if i != self.last][:5]
        best = (None, None, 0.0)
        for i in order:
            H, q = self.homography(f, self.feats[i])
            if H is not None and q > best[2]:
                best = (i, H, q)
            if q > 0.5:
                break
        i, H, q = best
        if H is None or overlap(H, img.shape) < self.min_overlap:
            self._keep(t, img, f, th)
            return len(self.keys) - 1, np.eye(3)
        self.last = i
        return i, H

    def _keep(self, t, img, f, th):
        self.keys.append(Keyframe(t, img))
        self.feats.append(f)
        self.thumbs.append(th)
        self.last = len(self.keys) - 1


def thumb(img: np.ndarray) -> np.ndarray:
    """A tiny normalised greyscale picture, for a quick 'does this look like that keyframe' check."""
    g = cv2.resize(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), (48, 27), interpolation=cv2.INTER_AREA).astype(np.float32)
    return (g - g.mean()) / (g.std() + 1e-6)


def overlap(H: np.ndarray, shape) -> float:
    """Roughly how much of the frame lands inside the keyframe."""
    h, w = shape[:2]
    pts = np.float32([[x, y] for y in np.linspace(0, h, 7) for x in np.linspace(0, w, 9)]).reshape(-1, 1, 2)
    p = cv2.perspectiveTransform(pts, H).reshape(-1, 2)
    inside = (p[:, 0] >= 0) & (p[:, 0] < w) & (p[:, 1] >= 0) & (p[:, 1] < h)
    return float(inside.mean())


def solve_cameras(keys: list[Keyframe]) -> list[int]:
    """Rotation and focal length for every keyframe (bundle adjustment). Returns the keyframes it could place."""
    d = cv2.detail
    if len(keys) < 2:
        # One view only (a very short or static video): no rotation to estimate. A typical Veo field of view.
        for k in keys:
            h, w = k.image.shape[:2]
            k.K = np.array([[0.8 * w, 0, w / 2], [0, 0.8 * w, h / 2], [0, 0, 1]], float)
            k.R = np.eye(3)
        return list(range(len(keys)))
    feats = []
    for k in keys:
        f = d.computeImageFeatures2(cv2.ORB_create(3000), k.image, static_overlay_mask(k.image.shape))
        feats.append(f)
    matcher = d.BestOf2NearestMatcher_create(False, 0.3)
    matches = matcher.apply2(feats)
    matcher.collectGarbage()
    keep = d.leaveBiggestComponent(feats, matches, 0.5)
    keep = [int(i) for i in np.array(keep).reshape(-1)]
    if len(keep) < 2:
        raise RuntimeError("The camera views in this video couldn't be matched to each other.")
    feats = [feats[i] for i in keep]
    matches = matcher.apply2(feats)
    ok, cams = d.HomographyBasedEstimator().apply(feats, matches, None)
    if not ok:
        raise RuntimeError("Couldn't work out the camera from this video.")
    for c in cams:
        c.R = c.R.astype(np.float32)
    ba = d.BundleAdjusterRay()
    ba.setConfThresh(0.5)
    ok, cams = ba.apply(feats, matches, cams)
    if not ok:
        raise RuntimeError("Couldn't work out the camera from this video.")
    rs = d.waveCorrect([np.copy(c.R) for c in cams], d.WAVE_CORRECT_HORIZ)
    for idx, c, r in zip(keep, cams, rs):
        K = np.array(c.K(), dtype=np.float64)
        keys[idx].K = K
        # OpenCV's camera R maps camera -> world; we store world -> camera.
        keys[idx].R = np.array(r, dtype=np.float64).T
    return keep


def rays(key: Keyframe, H: np.ndarray, pts_small: np.ndarray) -> np.ndarray:
    """Unit rays (in the shared reference frame) for pixels of a frame registered to `key` with homography H.
    `pts_small` are pixel positions at WORK_WIDTH."""
    p = cv2.perspectiveTransform(np.float32(pts_small).reshape(-1, 1, 2), H).reshape(-1, 2)
    hom = np.c_[p, np.ones(len(p))]
    r = (key.R.T @ np.linalg.inv(key.K) @ hom.T).T
    return r / np.linalg.norm(r, axis=1, keepdims=True)


def ray_to_pano(r: np.ndarray, scale: float) -> np.ndarray:
    """Panorama pixel for a ray (theta = left/right, phi = up/down)."""
    theta = np.arctan2(r[:, 0], r[:, 2])
    phi = np.arcsin(np.clip(r[:, 1], -1, 1))
    return np.c_[theta * scale, phi * scale]


def pano_to_ray(p: np.ndarray, scale: float) -> np.ndarray:
    theta, phi = p[:, 0] / scale, p[:, 1] / scale
    return np.c_[np.cos(phi) * np.sin(theta), np.sin(phi), np.cos(phi) * np.cos(theta)]


def render_pano(keys: list[Keyframe], width: int = 2400) -> tuple[np.ndarray, dict]:
    """A panorama of the whole ground from the keyframes, for the coach to tap pitch points on.
    Returns the image and the numbers needed to turn a tap back into a ray."""
    placed = [k for k in keys if k.R is not None]
    corners = []
    for k in placed:
        h, w = k.image.shape[:2]
        c = np.float32([[0, 0], [w, 0], [w, h], [0, h], [w / 2, 0], [w / 2, h]])
        hom = np.c_[c, np.ones(len(c))]
        r = (k.R.T @ np.linalg.inv(k.K) @ hom.T).T
        corners.append(r / np.linalg.norm(r, axis=1, keepdims=True))
    allr = np.vstack(corners)
    th = np.arctan2(allr[:, 0], allr[:, 2])
    ph = np.arcsin(np.clip(allr[:, 1], -1, 1))
    t0, t1, p0, p1 = th.min(), th.max(), ph.min(), ph.max()
    scale = width / (t1 - t0)
    hgt = int((p1 - p0) * scale)
    xs, ys = np.meshgrid(np.arange(width), np.arange(hgt))
    pts = np.c_[(xs.ravel() + t0 * scale), (ys.ravel() + p0 * scale)]
    rr = pano_to_ray(pts, scale)
    out = np.zeros((hgt * width, 3), np.uint8)
    best = np.full(hgt * width, np.inf)
    for k in placed:
        h, w = k.image.shape[:2]
        cam = (k.K @ k.R @ rr.T).T
        z = cam[:, 2]
        u, v = cam[:, 0] / np.where(z > 0, z, np.nan), cam[:, 1] / np.where(z > 0, z, np.nan)
        ok = (z > 0) & (u >= 0) & (u < w - 1) & (v >= 0) & (v < h - 1)
        # Prefer the keyframe where this point is nearest the middle (least distorted).
        dist = np.hypot(u - w / 2, v - h / 2)
        use = ok & (dist < best)
        best[use] = dist[use]
        out[use] = k.image[v[use].astype(int), u[use].astype(int)]
    info = {"scale": float(scale), "theta0": float(t0), "phi0": float(p0), "width": width, "height": hgt}
    return out.reshape(hgt, width, 3), info


def pano_pixel_to_ray(x: float, y: float, info: dict) -> np.ndarray:
    s = info["scale"]
    return pano_to_ray(np.array([[x + info["theta0"] * s, y + info["phi0"] * s]]), s)[0]


def deg(r: float) -> float:
    return r * 180 / math.pi
