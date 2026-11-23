# Overlap video worker

Works out team stats (possession, how it changed through the game, the two shirt colours) from a match
video. Coaches upload the video in the app (Match → Review); it goes straight to Cloudflare R2, this worker
analyses it on a GPU on Modal, reports back to `/api/match-video/callback`, and the app deletes the video.

Licences: RF-DETR (Apache-2.0, Nano–Large weights), trackers (Apache-2.0), supervision (MIT),
scikit-learn (BSD), OpenCV (Apache-2.0), EasyOCR (Apache-2.0, shirt numbers). No AGPL/GPL code.

Players are told apart by shirt number (`numbers.py`): read when they're near the camera, a few times per
track, and voted on. The coach confirms which squad player wore each number in the app.

## Pitch mapping

The analysis also tracks where the camera is looking (`camera.py`): a Veo follow-cam is one fixed camera
turning and zooming, so frames are matched to keyframes and bundle-adjusted with OpenCV's stitching tools,
no training needed. It saves everyone's position as a camera ray (`data/<job>.npz`, kept 30 days) and a
panorama of the ground. The coach taps 4+ known points on the panorama (halfway line, centre circle, goals,
corners); `pitchmap.py` solves the camera's position and height and the pitch size, and `mapping.py`
works out heat maps, the ball in each third, distance covered, back-line height and width.

## AI analyst report

After the analysis, `moments.py` finds the key moments (attacks into the final third, the ball won high,
dangerous moments near goal, long spells) from the tracking, and saves a 2 × 2 frame strip for each plus a few
wide shots of the teams' shapes (`data/<job>_frames/`, kept 30 days). When a coach asks for the report,
`report.py` sends those frames and the match numbers to Claude, which writes the analyst's report. Add
`ANTHROPIC_API_KEY` to the `overlap-video` Modal secret for this. Frames go to Anthropic only for teams whose
admin has switched on AI video reports.

## Try it on a clip (CPU)

    python -m venv .venv && . .venv/bin/activate
    pip install -r requirements.txt
    python -m overlap_video clip.mp4 --seconds 120 --model nano --debug debug/

`debug/` gets a few frames with each player boxed in their team's colour, to check by eye.

## Deploy

1. **Modal:** `pip install modal && modal setup`, then
   `modal secret create overlap-video VIDEO_WORKER_SECRET=<long random string>` and `modal deploy modal_app.py`.
2. **Cloudflare R2:** create a bucket (e.g. `overlap-video`) and an API token with Object Read & Write on it.
   In the bucket's CORS settings, allow `PUT` and `GET` from your site and expose the `ETag` header:

        [{"AllowedOrigins":["https://overlap-three-pi.vercel.app"],"AllowedMethods":["PUT","GET"],"AllowedHeaders":["*"],"ExposeHeaders":["ETag"],"MaxAgeSeconds":3600}]

   Add a lifecycle rule to delete objects after 2 days, as a backstop (the app deletes them after analysis).
3. **Vercel env:** `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`,
   `VIDEO_WORKER_URL` (the `start` URL Modal printed), `VIDEO_WORKER_SECRET` (same string as in Modal),
   and `SITE_URL` (your site's address, for the callback). Redeploy.

## Local end-to-end test

`VIDEO_WORKER_SECRET=x python local_server.py` stands in for Modal on port 8765.
