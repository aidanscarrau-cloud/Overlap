"""Run one analysis job: download the video, analyse it, report back to Overlap.

Shared by the Modal app (production, GPU) and local_server.py (testing on a laptop or CPU).
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import tempfile
import time
import urllib.request

from .pipeline import Settings, analyse


class Cancelled(Exception):
    pass


def post(callback_url: str, secret: str, payload: dict) -> dict:
    body = json.dumps(payload, separators=(",", ":")).encode()
    ts = str(int(time.time()))
    sig = hmac.new(secret.encode(), f"{ts}.".encode() + body, hashlib.sha256).hexdigest()
    req = urllib.request.Request(callback_url, data=body, method="POST", headers={"content-type": "application/json", "x-overlap-timestamp": ts, "x-overlap-signature": sig})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read() or b"{}")


def download(url: str, dest: str, on_progress=None) -> None:
    with urllib.request.urlopen(url, timeout=60) as r, open(dest, "wb") as f:
        total = int(r.headers.get("content-length") or 0)
        done = 0
        while chunk := r.read(8 * 1024 * 1024):
            f.write(chunk)
            done += len(chunk)
            if on_progress and total:
                on_progress(done / total)


def run_job(job: dict, secret: str, settings: Settings | None = None, model=None) -> None:
    job_id, cb = job["job_id"], job["callback_url"]
    last = [0.0]

    def report(progress: float, message: str, force: bool = False):
        if not force and time.time() - last[0] < 10:
            return
        last[0] = time.time()
        try:
            if post(cb, secret, {"job_id": job_id, "status": "processing", "progress": progress, "message": message}).get("stop"):
                raise Cancelled()
        except Cancelled:
            raise
        except Exception as e:  # a missed progress update isn't fatal
            print("progress report failed:", e)

    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "match.mp4")
        try:
            report(0.01, "Downloading the video", force=True)
            download(job["video_url"], path, lambda p: report(0.01 + 0.08 * p, "Downloading the video"))
            res = analyse(path, settings, progress=lambda p, m: report(0.1 + 0.88 * p, m), model=model)
            post(cb, secret, {"job_id": job_id, "status": "done", "progress": 1, "message": "Done", "results": res})
        except Cancelled:
            print("job cancelled", job_id)
        except Exception as e:
            print("job failed", job_id, repr(e))
            try:
                post(cb, secret, {"job_id": job_id, "status": "failed", "message": f"Analysis failed: {str(e)[:200]}"})
            except Exception as e2:
                print("couldn't report failure:", e2)
