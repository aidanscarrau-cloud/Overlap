"""Shirt numbers, so stats can be given per player.

Teammates wear the same kit, so the only reliable way to tell them apart in a wide match video is the
number on their back. We read it with EasyOCR (Apache-2.0) when a player is close enough to the camera,
a few times per track, and take a vote. A single read is right most of the time (22 of 24 on a real Veo
match); the vote removes most of the rest. Reads that never agree leave the player unidentified, and
they still count for the team stats.

Only the numbers are kept: no pictures of players are stored.
"""

from __future__ import annotations

from collections import defaultdict

import cv2
import numpy as np

MIN_HEIGHT = 55  # pixels (at 1920 wide): smaller players' numbers can't be read
MAX_READS = 14  # attempts per track
EVERY = 1.0  # seconds between attempts on the same track


class NumberReader:
    def __init__(self, gpu: bool = False):
        self._reader = None
        self.gpu = gpu
        self.reads: dict[int, list[tuple[str, float]]] = defaultdict(list)
        self.tries: dict[int, int] = defaultdict(int)
        self.last: dict[int, float] = {}

    def _ocr(self):
        if self._reader is None:
            import easyocr

            self._reader = easyocr.Reader(["en"], gpu=self.gpu, verbose=False)
        return self._reader

    def maybe_read(self, tid: int, t: float, frame: np.ndarray, box: np.ndarray) -> None:
        """Try to read this player's number, if they're big enough and it's been a moment since the last try."""
        x1, y1, x2, y2 = box.astype(int)
        h = y2 - y1
        if h < MIN_HEIGHT or self.tries[tid] >= MAX_READS or t - self.last.get(tid, -1e9) < EVERY:
            return
        self.last[tid] = t
        self.tries[tid] += 1
        crop = frame[max(0, y1) : y1 + int(0.55 * h), max(0, x1) : max(0, x2)]  # the shirt, where the number is
        if crop.size == 0:
            return
        s = max(1.0, 128 / crop.shape[0])
        big = cv2.resize(crop, None, fx=s, fy=s, interpolation=cv2.INTER_CUBIC)
        try:
            found = self._ocr().readtext(big, allowlist="0123456789", detail=1)
        except Exception:
            return
        found = [(txt, float(cf)) for _, txt, cf in found if cf > 0.5 and 1 <= len(txt) <= 2 and not (len(txt) == 2 and txt[0] == "0")]
        if found:
            self.reads[tid].append(max(found, key=lambda x: x[1]))

    def number_of(self, tid: int) -> int | None:
        """The track's number, if the reads agree well enough."""
        reads = self.reads.get(tid) or []
        if not reads:
            return None
        score: dict[str, float] = defaultdict(float)
        for txt, cf in reads:
            score[txt] += cf
        # A single digit is often half of a two-digit number seen at an angle ("2" of "22", "0" of "40"):
        # count it towards the two-digit number it's part of, if there is one.
        count: dict[str, int] = defaultdict(int)
        for txt, _ in reads:
            count[txt] += 1
        for d in [k for k in score if len(k) == 1]:
            homes = [k for k in score if len(k) == 2 and d in k]
            if homes:
                home = max(homes, key=score.get)
                score[home] += score.pop(d)
                count[home] += count.pop(d)
        best = max(score, key=score.get)
        n_best = count[best]
        share = score[best] / sum(score.values())
        # Two agreeing reads, or one very confident two-digit read; and clearly ahead of any other number.
        if share >= 0.6 and (n_best >= 2 or (len(best) == 2 and max((cf for txt, cf in reads if txt == best), default=0) >= 0.95)):
            return int(best)
        return None
