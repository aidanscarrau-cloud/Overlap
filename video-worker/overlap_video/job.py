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

# Where each match's positions are kept between the analysis and the coach mapping the pitch.
DATA_DIR = os.environ.get("OVERLAP_DATA_DIR", os.path.join(os.path.dirname(__file__), "..", "data"))


KEEP_DAYS = 30


def tidy_old_data() -> None:
    """Saved positions are only kept for 30 days."""
    if not os.path.isdir(DATA_DIR):
        return
    cutoff = time.time() - KEEP_DAYS * 86400
    for name in os.listdir(DATA_DIR):
        p = os.path.join(DATA_DIR, name)
        try:
            if name.endswith(".npz") and os.path.getmtime(p) < cutoff:
                os.remove(p)
        except OSError:
            pass


def data_file(job_id: str) -> str:
    safe = "".join(c for c in job_id if c.isalnum() or c == "-")[:64]
    os.makedirs(DATA_DIR, exist_ok=True)
    return os.path.join(DATA_DIR, f"{safe}.npz")


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
    tidy_old_data()

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
            res = analyse(path, settings, progress=lambda p, m: report(0.1 + 0.88 * p, m), model=model, data_path=data_file(job_id))
            pv = res.get("pitch_view") or {}
            if pv.get("pano_jpeg") and os.path.exists(data_file(job_id)):
                # Keep the panorama with the positions, for the mapping step.
                import numpy as np

                rows = np.load(data_file(job_id))["rows"]
                np.savez_compressed(data_file(job_id), rows=rows, pano_jpeg=np.frombuffer(pv["pano_jpeg"].encode(), np.uint8), pano=np.frombuffer(json.dumps(pv["pano"]).encode(), np.uint8))
            post(cb, secret, {"job_id": job_id, "status": "done", "progress": 1, "message": "Done", "results": res})
        except Cancelled:
            print("job cancelled", job_id)
        except Exception as e:
            print("job failed", job_id, repr(e))
            try:
                post(cb, secret, {"job_id": job_id, "status": "failed", "message": f"Analysis failed: {str(e)[:200]}"})
            except Exception as e2:
                print("couldn't report failure:", e2)


def run_map(job: dict, secret: str) -> None:
    """The coach has tapped pitch points: turn the saved positions into pitch stats in metres."""
    import numpy as np

    from .mapping import map_pitch

    job_id, cb = job["job_id"], job["callback_url"]
    try:
        path = data_file(job_id)
        if not os.path.exists(path):
            raise RuntimeError("The saved positions for this video have expired. Analyse the video again.")
        d = np.load(path)
        pano_jpeg = bytes(d["pano_jpeg"]).decode()
        info = json.loads(bytes(d["pano"]).decode())
        taps = {k: (float(v[0]), float(v[1])) for k, v in (job.get("taps") or {}).items()}
        res = map_pitch(d["rows"], taps, info, pano_jpeg, job.get("length"), job.get("width"))
        post(cb, secret, {"job_id": job_id, "mapping": json.loads(json.dumps(res, default=float))})
    except Exception as e:
        print("mapping failed", job_id, repr(e))
        try:
            post(cb, secret, {"job_id": job_id, "mapping_error": f"Couldn't map the pitch: {str(e)[:200]}"})
        except Exception as e2:
            print("couldn't report failure:", e2)
