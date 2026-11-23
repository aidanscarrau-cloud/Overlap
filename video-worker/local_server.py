"""Local stand-in for the Modal worker, for testing on a laptop or CPU:

    VIDEO_WORKER_SECRET=... python local_server.py   # listens on :8765
    then set VIDEO_WORKER_URL=http://localhost:8765 for the Next.js app.
"""

import json
import os
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

from overlap_video.job import run_dataset, run_job, run_map, run_report, run_withdraw
from overlap_video.pipeline import Settings

SECRET = os.environ["VIDEO_WORKER_SECRET"]
SETTINGS = Settings(model_size=os.environ.get("MODEL", "nano"), max_seconds=float(os.environ["MAX_SECONDS"]) if os.environ.get("MAX_SECONDS") else None)


class H(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.headers.get("authorization") != f"Bearer {SECRET}":
            self.send_response(401)
            self.end_headers()
            return
        job = json.loads(self.rfile.read(int(self.headers.get("content-length", 0))))
        if job.get("kind") == "map":
            threading.Thread(target=run_map, args=(job, SECRET), daemon=True).start()
        elif job.get("kind") == "dataset":
            threading.Thread(target=run_dataset, args=(job, SECRET), daemon=True).start()
        elif job.get("kind") == "withdraw":
            threading.Thread(target=run_withdraw, args=(job, SECRET), daemon=True).start()
        elif job.get("kind") == "report":
            threading.Thread(target=run_report, args=(job, SECRET), daemon=True).start()
        else:
            threading.Thread(target=run_job, args=(job, SECRET, SETTINGS), daemon=True).start()
        self.send_response(202)
        self.end_headers()
        self.wfile.write(b'{"ok":true}')


HTTPServer(("127.0.0.1", int(os.environ.get("PORT", 8765))), H).serve_forever()
