"""Run the analysis on a video file:  python -m overlap_video match.mp4 --seconds 120 --debug out/"""
import argparse
import json
import sys
import time

from .pipeline import Settings, analyse

ap = argparse.ArgumentParser()
ap.add_argument("video")
ap.add_argument("--seconds", type=float, default=None, help="only analyse the first N seconds")
ap.add_argument("--fps", type=float, default=5.0)
ap.add_argument("--model", default="medium", choices=["nano", "small", "medium", "large"])
ap.add_argument("--debug", default=None, help="folder for check pictures")
ap.add_argument("--out", default=None, help="write the JSON result here")
a = ap.parse_args()
t0 = time.time()
res = analyse(a.video, Settings(sample_fps=a.fps, model_size=a.model, max_seconds=a.seconds), progress=lambda p, m: print(f"{p:5.0%} {m}", file=sys.stderr), debug_dir=a.debug)
res["runtime_seconds"] = round(time.time() - t0, 1)
txt = json.dumps(res, indent=1)
if a.out:
    open(a.out, "w").write(txt)
print(txt)
