"""Overlap video worker on Modal (GPU, pay per second, scales to zero).

Deploy (once you have a Modal account):
    pip install modal && modal setup
    modal secret create overlap-video VIDEO_WORKER_SECRET=<same value as in Vercel>
    modal deploy modal_app.py
Then put the printed "start" URL in Vercel as VIDEO_WORKER_URL.
"""

import os

import modal

app = modal.App("overlap-video")

image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("ffmpeg", "libgl1", "libglib2.0-0")
    .pip_install(
        "torch==2.15.0",
        "torchvision==0.29.2",
        "rfdetr==1.12.1",
        "trackers==2.7.0",
        "supervision==0.32.0",
        "opencv-python-headless==5.1.0.95",
        "scikit-learn==1.9.1",
        "numpy==2.5.4",
        "fastapi[standard]",
    )
    .add_local_python_source("overlap_video")
)

# Model weights are downloaded once and kept here, so each job starts quickly.
weights = modal.Volume.from_name("overlap-video-weights", create_if_missing=True)
# Each match's positions, kept so the coach can map the pitch afterwards (delete files older than ~30 days).
data = modal.Volume.from_name("overlap-video-data", create_if_missing=True)
secret = modal.Secret.from_name("overlap-video")

with image.imports():
    from fastapi import HTTPException, Request


@app.cls(gpu="L4", image=image, volumes={"/root/.roboflow": weights, "/data": data}, secrets=[secret], timeout=3 * 3600, scaledown_window=60, max_containers=4)
class Worker:
    @modal.enter()
    def load(self):
        from overlap_video.pipeline import load_model

        self.model = load_model("medium")
        weights.commit()

    @modal.method()
    def run(self, job: dict):
        from overlap_video.job import run_job
        from overlap_video.pipeline import Settings

        os.environ["OVERLAP_DATA_DIR"] = "/data"
        run_job(job, os.environ["VIDEO_WORKER_SECRET"], Settings(model_size="medium", sample_fps=5.0), model=self.model)
        data.commit()


# Mapping the pitch is light work: no GPU needed.
@app.function(image=image, volumes={"/data": data}, secrets=[secret], timeout=600)
def map_job(job: dict):
    from overlap_video.job import run_map

    os.environ["OVERLAP_DATA_DIR"] = "/data"
    data.reload()
    run_map(job, os.environ["VIDEO_WORKER_SECRET"])


@app.function(image=image, secrets=[secret])
@modal.fastapi_endpoint(method="POST")
async def start(request: Request):
    import hmac

    auth = request.headers.get("authorization", "")
    if not hmac.compare_digest(auth, f"Bearer {os.environ['VIDEO_WORKER_SECRET']}"):
        raise HTTPException(status_code=401)
    job = await request.json()
    if job.get("kind") == "map":
        if not all(isinstance(job.get(k), str) for k in ("job_id", "callback_url")) or not isinstance(job.get("taps"), dict):
            raise HTTPException(status_code=400)
        map_job.spawn(job)
        return {"ok": True}
    if not all(isinstance(job.get(k), str) for k in ("job_id", "video_url", "callback_url")):
        raise HTTPException(status_code=400)
    Worker().run.spawn(job)
    return {"ok": True}
