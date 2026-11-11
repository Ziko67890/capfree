"""Background removal for video, as a polled job.

rembg is a per-frame segmentation model on the CPU: measured here at 2.1-2.8s a
frame for u2net and 1.17s for u2netp, regardless of resolution (it resamples to
320x320 internally). Thirty seconds of 30fps footage is 900 frames, so an
uncapped run is half an hour. Three things follow, and they are the whole
design:

  * It cannot be a blocking request. The upload returns a job id and the client
    polls, so nothing sits on an open socket for minutes.
  * The work is bounded twice over -- by seconds of source AND by a hard frame
    ceiling -- so a long upload cannot queue an unbounded amount of compute.
  * Output is sampled down to SAMPLE_FPS. At 15fps a 30s clip is 450 frames
    instead of 900, which halves the wait for footage that is mostly static
    anyway.

The model session is created once per job and reused. Creating it per frame
would reload a 176MB ONNX graph every time.

Output is WebM/VP9, not MP4. H.264 has no alpha pixel format at all -- the
encoder advertises yuv420p and friends and nothing else -- so a "transparent
MP4" is not a thing that exists. libvpx-vp9 takes yuva420p and writes an
AlphaMode flag the editor's importer detects.
"""

import os
import shutil
import subprocess
import tempfile
import threading
import time
import uuid
from typing import Optional

from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse

from silence import check_auth, save_upload

router = APIRouter()

MODELS = ("u2netp", "u2net", "isnet-general-use")

MAX_SECONDS = float(os.getenv("BG_MAX_SECONDS", "30"))
# Second ceiling, in frames: the real cost driver is frame count, not duration.
MAX_FRAMES = int(os.getenv("BG_MAX_FRAMES", "450"))
SAMPLE_FPS = float(os.getenv("BG_SAMPLE_FPS", "15"))

# Rough per-frame cost, used only to quote an ETA. Measured on this machine.
SECONDS_PER_FRAME = {"u2netp": 1.2, "u2net": 2.6, "isnet-general-use": 2.6}

INSTALL_HINT = (
    "Background removal needs the rembg package. Install it with "
    "'pip install rembg' (or 'pip install -r api/requirements.txt') and restart the API."
)

# job id -> dict. In memory by design; a restart loses queued work, which for a
# best-effort render is the right failure mode.
_jobs: dict = {}
_lock = threading.Lock()

# A finished job keeps its output on disk this long so the client can fetch it.
JOB_TTL_SECONDS = 3600


def _require_rembg():
    try:
        import rembg  # noqa: F401
    except ImportError:
        raise HTTPException(503, INSTALL_HINT)


def _set(job_id: str, **patch) -> None:
    with _lock:
        job = _jobs.get(job_id)
        if job is not None:
            job.update(patch)


def _get(job_id: str) -> dict:
    with _lock:
        job = _jobs.get(job_id)
        if job is None:
            raise HTTPException(404, "No such background-removal job")
        return dict(job)


def _purge_expired() -> None:
    """Drops finished jobs whose output has aged out, with their temp dirs."""
    now = time.time()
    with _lock:
        stale = [
            jid
            for jid, job in _jobs.items()
            if job["status"] in ("done", "error")
            and now - job.get("finished_at", now) > JOB_TTL_SECONDS
        ]
        for jid in stale:
            shutil.rmtree(_jobs[jid].get("workdir", ""), ignore_errors=True)
            _jobs.pop(jid, None)


def _probe_video(path: str):
    """(fps, frame_count, duration) via OpenCV, which is already a dependency."""
    import cv2

    capture = cv2.VideoCapture(path)
    if not capture.isOpened():
        capture.release()
        raise HTTPException(400, "Could not read this video")
    fps = capture.get(cv2.CAP_PROP_FPS) or 0
    frames = capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0
    capture.release()
    if fps <= 0:
        fps = 30.0
    duration = frames / fps if frames > 0 else 0.0
    return fps, int(frames), duration


def _plan(source_fps: float, duration: float):
    """How many frames will actually be cut, and at what rate they play back."""
    span = min(duration, MAX_SECONDS) if duration > 0 else MAX_SECONDS
    out_fps = min(source_fps, SAMPLE_FPS) or SAMPLE_FPS
    planned = int(span * out_fps) or 1
    if planned > MAX_FRAMES:
        planned = MAX_FRAMES
        span = planned / out_fps
    return planned, out_fps, span


def _render(job_id: str, src: str, workdir: str, model: str) -> None:
    """Worker body. Every exit path has to leave the job in a terminal state."""
    import cv2
    from PIL import Image
    from rembg import new_session, remove

    try:
        source_fps, _count, duration = _probe_video(src)
        planned, out_fps, _span = _plan(source_fps, duration)
        _set(job_id, frames_total=planned, status="running")

        frames_dir = os.path.join(workdir, "frames")
        os.makedirs(frames_dir, exist_ok=True)

        # One session for the whole job; the model load is the expensive part.
        session = new_session(model)

        capture = cv2.VideoCapture(src)
        if not capture.isOpened():
            raise RuntimeError("Could not open the uploaded video")

        step = max(1.0, source_fps / out_fps)
        written = 0
        index = 0.0
        started = time.time()
        try:
            while written < planned:
                capture.set(cv2.CAP_PROP_POS_FRAMES, int(index))
                ok, frame = capture.read()
                if not ok:
                    break

                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                cut = remove(Image.fromarray(rgb), session=session)
                if not isinstance(cut, Image.Image):
                    cut = Image.open(__import__("io").BytesIO(cut))
                cut.convert("RGBA").save(os.path.join(frames_dir, "f%05d.png" % written))

                written += 1
                index += step
                elapsed = time.time() - started
                _set(
                    job_id,
                    frames_done=written,
                    progress=round(written / planned, 4),
                    eta_seconds=round((elapsed / written) * (planned - written), 1),
                )
                if _get(job_id).get("cancelled"):
                    raise RuntimeError("Cancelled")
        finally:
            capture.release()

        if written == 0:
            raise RuntimeError("No frames could be read from this video")

        _set(job_id, status="encoding", eta_seconds=None)
        out = os.path.join(workdir, "nobg.webm")
        # yuva420p is the alpha-carrying format; -auto-alt-ref 0 is required or
        # libvpx silently drops the alpha plane.
        cmd = [
            "ffmpeg", "-y", "-loglevel", "error",
            "-framerate", f"{out_fps:g}",
            "-i", os.path.join(frames_dir, "f%05d.png"),
            "-c:v", "libvpx-vp9",
            "-pix_fmt", "yuva420p",
            "-auto-alt-ref", "0",
            "-b:v", "2M",
            out,
        ]
        result = subprocess.run(cmd, capture_output=True)
        if result.returncode != 0 or not os.path.exists(out):
            raise RuntimeError(
                "Could not encode the transparent video: "
                + (result.stderr.decode("utf-8", "replace")[-200:] or "ffmpeg failed")
            )

        shutil.rmtree(frames_dir, ignore_errors=True)
        _set(
            job_id,
            status="done",
            progress=1.0,
            output_path=out,
            output_bytes=os.path.getsize(out),
            output_fps=out_fps,
            finished_at=time.time(),
        )
    except Exception as exc:
        _set(
            job_id,
            status="error",
            error=str(exc) or exc.__class__.__name__,
            finished_at=time.time(),
        )
    finally:
        # The upload itself is never needed again once frames are cut.
        try:
            os.remove(src)
        except OSError:
            pass


@router.post("/video/remove-bg")
def video_remove_bg(
    file: UploadFile = File(...),
    model: str = Form("u2net"),
    x_api_key: Optional[str] = Header(None),
):
    """Queue a background removal. Returns a job id to poll; does not block."""
    check_auth(x_api_key)
    _require_rembg()
    if model not in MODELS:
        raise HTTPException(400, f"model must be one of: {', '.join(MODELS)}")

    _purge_expired()

    workdir = tempfile.mkdtemp(prefix="capfree-nobg-")
    src = os.path.join(workdir, "input")
    try:
        save_upload(file, src)
        source_fps, _count, duration = _probe_video(src)
    except Exception:
        shutil.rmtree(workdir, ignore_errors=True)
        raise

    planned, out_fps, span = _plan(source_fps, duration)
    job_id = uuid.uuid4().hex

    with _lock:
        _jobs[job_id] = {
            "job_id": job_id,
            "status": "queued",
            "progress": 0.0,
            "frames_done": 0,
            "frames_total": planned,
            "eta_seconds": round(planned * SECONDS_PER_FRAME.get(model, 2.6), 1),
            "model": model,
            "workdir": workdir,
            "output_path": None,
            "error": None,
            "cancelled": False,
            "created_at": time.time(),
        }

    threading.Thread(
        target=_render, args=(job_id, src, workdir, model), daemon=True
    ).start()

    snapshot = _get(job_id)
    return {
        "job_id": job_id,
        "status": snapshot["status"],
        "frames_total": planned,
        "output_fps": out_fps,
        "seconds_processed": round(span, 2),
        "eta_seconds": snapshot["eta_seconds"],
        # Stated up front: this is minutes of CPU, not a quick filter.
        "note": (
            f"Cutting {planned} frames at {out_fps:g}fps. "
            f"Roughly {snapshot['eta_seconds'] / 60:.1f} minutes on CPU."
        ),
    }


@router.get("/video/remove-bg/{job_id}/status")
def video_remove_bg_status(job_id: str, x_api_key: Optional[str] = Header(None)):
    """Poll a job. `status` is queued, running, encoding, done or error."""
    check_auth(x_api_key)
    job = _get(job_id)
    return {
        "job_id": job["job_id"],
        "status": job["status"],
        "progress": job["progress"],
        "frames_done": job["frames_done"],
        "frames_total": job["frames_total"],
        "eta_seconds": job.get("eta_seconds"),
        "model": job["model"],
        "error": job["error"],
        # Where the file sits on the server, as asked. A browser cannot read a
        # server path, so /result is what the client actually fetches.
        "output_path": job["output_path"],
        "output_bytes": job.get("output_bytes"),
        "result_url": f"/video/remove-bg/{job_id}/result" if job["output_path"] else None,
    }


@router.get("/video/remove-bg/{job_id}/result")
def video_remove_bg_result(job_id: str, x_api_key: Optional[str] = Header(None)):
    """The finished transparent WebM."""
    check_auth(x_api_key)
    job = _get(job_id)
    if job["status"] == "error":
        raise HTTPException(500, job["error"] or "That job failed")
    if job["status"] != "done" or not job["output_path"]:
        raise HTTPException(409, f"That job is still {job['status']}")
    if not os.path.exists(job["output_path"]):
        raise HTTPException(410, "That result has been cleaned up — run it again")
    return FileResponse(job["output_path"], media_type="video/webm", filename="nobg.webm")


@router.delete("/video/remove-bg/{job_id}")
def video_remove_bg_cancel(job_id: str, x_api_key: Optional[str] = Header(None)):
    """Asks a running job to stop at the next frame, and frees its output."""
    check_auth(x_api_key)
    job = _get(job_id)
    _set(job_id, cancelled=True)
    if job["status"] in ("done", "error"):
        shutil.rmtree(job.get("workdir", ""), ignore_errors=True)
        with _lock:
            _jobs.pop(job_id, None)
    return {"job_id": job_id, "cancelled": True}
