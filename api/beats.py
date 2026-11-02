import os
import random
import shutil
import subprocess
import tempfile
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse
from PIL import Image, UnidentifiedImageError

from silence import probe, save_upload

router = APIRouter()

MAX_CLIPS = 20
MAX_DURATION_CAP = 60.0


# ── beat detection ───────────────────────────────────────────────

def analyze_beats(src: str, tmp: str, limit: float):
    """Return (bpm, beat_times, duration) for the first `limit` seconds of the music."""
    wav = os.path.join(tmp, "music.wav")
    r = subprocess.run(
        ["ffmpeg", "-y", "-i", src, "-vn", "-ac", "1", "-ar", "22050", "-t", str(limit), wav],
        capture_output=True,
    )
    if r.returncode != 0:
        raise HTTPException(400, "Could not read audio from the music file")

    import librosa
    import numpy as np

    y, sr = librosa.load(wav, sr=22050, mono=True)
    if len(y) < sr:
        raise HTTPException(400, "Music is too short (need at least 1 second)")
    tempo, frames = librosa.beat.beat_track(y=y, sr=sr)
    times = [round(float(t), 3) for t in librosa.frames_to_time(frames, sr=sr)]
    return round(float(np.atleast_1d(tempo)[0]), 1), times, len(y) / sr


def plan_cuts(beats, end: float, per_cut: int, min_len: float = 0.25):
    """Cut points: start of video, then every `per_cut`-th beat, then the end."""
    marks = [0.0] + beats[::per_cut]
    cleaned = []
    for m in marks:
        if m < end - min_len and (not cleaned or m - cleaned[-1] >= min_len):
            cleaned.append(m)
    cleaned.append(end)
    return cleaned


def assign_clips(cuts, clips, shuffle: bool):
    """Give every segment a clip and a start offset inside it (clips are used in turn)."""
    order, offsets, plan = [], [0.0] * len(clips), []
    for i in range(len(cuts) - 1):
        if not order:
            order = list(range(len(clips)))
            if shuffle:
                random.shuffle(order)
        idx = order.pop(0)
        seg_len = cuts[i + 1] - cuts[i]
        plan.append({"start": round(cuts[i], 3), "end": round(cuts[i + 1], 3),
                     "clip": idx, "offset": round(offsets[idx], 3)})
        if clips[idx]["is_image"]:
            continue
        offsets[idx] += seg_len
        if offsets[idx] + 0.3 > clips[idx]["duration"]:
            offsets[idx] = 0.0
    return plan


# ── rendering ────────────────────────────────────────────────────

def is_still_image(path: str) -> bool:
    try:
        with Image.open(path) as im:
            return getattr(im, "n_frames", 1) == 1
    except (UnidentifiedImageError, OSError):
        return False


def render_segment(clip, offset, seg_len, frames, w, h, fps, dst):
    vf = f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},setsar=1,fps={fps}"
    if clip["is_image"]:
        pre = ["-loop", "1", "-framerate", str(fps)]
    else:
        pre = ["-ss", f"{offset:.3f}"]
        vf += f",tpad=stop_mode=clone:stop_duration={seg_len:.3f}"
    cmd = ["ffmpeg", "-y", *pre, "-i", clip["path"], "-vf", vf, "-frames:v", str(frames),
           "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p", dst]
    if subprocess.run(cmd, capture_output=True).returncode != 0:
        raise HTTPException(500, "Rendering failed on one of the clips")


def check_auth(x_api_key):
    api_key = os.getenv("API_KEY")
    if api_key and x_api_key != api_key:
        raise HTTPException(401, "Invalid API key")


# ── endpoints ────────────────────────────────────────────────────

@router.post("/beats")
def beats(
    music: UploadFile = File(...),
    max_duration: float = Form(60),
    x_api_key: Optional[str] = Header(None),
):
    """Detect tempo and beat timestamps (for the editor to snap cuts to)."""
    check_auth(x_api_key)
    if not 5 <= max_duration <= 300:
        raise HTTPException(400, "max_duration must be between 5 and 300")
    tmp = tempfile.mkdtemp()
    try:
        src = os.path.join(tmp, "music")
        save_upload(music, src)
        bpm, times, duration = analyze_beats(src, tmp, max_duration)
        return {"bpm": bpm, "duration": round(duration, 2), "beats": times}
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


@router.post("/beat-sync")
def beat_sync(
    background: BackgroundTasks,
    music: UploadFile = File(...),
    clips: List[UploadFile] = File(...),
    beats_per_cut: int = Form(2),
    max_duration: float = Form(30),
    width: int = Form(720),
    height: int = Form(1280),
    fps: int = Form(30),
    shuffle: bool = Form(False),
    output: str = Form("video"),
    x_api_key: Optional[str] = Header(None),
):
    check_auth(x_api_key)
    if not 1 <= beats_per_cut <= 16:
        raise HTTPException(400, "beats_per_cut must be between 1 and 16")
    if not 5 <= max_duration <= MAX_DURATION_CAP:
        raise HTTPException(400, f"max_duration must be between 5 and {MAX_DURATION_CAP:.0f}")
    if not (160 <= width <= 1920 and 160 <= height <= 1920) or width % 2 or height % 2:
        raise HTTPException(400, "width and height must be even numbers between 160 and 1920")
    if not 15 <= fps <= 60:
        raise HTTPException(400, "fps must be between 15 and 60")
    if output not in ("video", "json"):
        raise HTTPException(400, "output must be video or json")
    if not 1 <= len(clips) <= MAX_CLIPS:
        raise HTTPException(400, f"send between 1 and {MAX_CLIPS} clips")

    tmp = tempfile.mkdtemp()
    try:
        music_path = os.path.join(tmp, "music")
        save_upload(music, music_path)
        bpm, all_beats, music_len = analyze_beats(music_path, tmp, max_duration)
        end = min(max_duration, music_len)
        usable = [b for b in all_beats if b < end]
        if len(usable) < 2:
            raise HTTPException(422, "Could not find a steady beat in this music")

        infos = []
        for i, up in enumerate(clips):
            path = os.path.join(tmp, f"clip{i}")
            save_upload(up, path)
            if is_still_image(path):
                infos.append({"path": path, "is_image": True, "duration": 0.0})
                continue
            duration, has_video, _ = probe(path)
            if not has_video:
                raise HTTPException(400, f"Clip {i + 1} is not a video or an image")
            infos.append({"path": path, "is_image": False, "duration": duration})

        cuts = plan_cuts(usable, end, beats_per_cut)
        plan = assign_clips(cuts, infos, shuffle)

        if output == "json":
            result = {
                "bpm": bpm,
                "music_duration": round(music_len, 2),
                "beats": usable,
                "segments": plan,
                "clips": [{"index": i, "type": "image" if c["is_image"] else "video",
                           "duration": round(c["duration"], 2)} for i, c in enumerate(infos)],
            }
            shutil.rmtree(tmp, ignore_errors=True)
            return result

        seg_files = []
        for i, seg in enumerate(plan):
            frames = max(1, round(seg["end"] * fps) - round(seg["start"] * fps))
            dst = os.path.join(tmp, f"seg{i:03d}.mp4")
            render_segment(infos[seg["clip"]], seg["offset"], seg["end"] - seg["start"],
                           frames, width, height, fps, dst)
            seg_files.append(dst)

        listing = os.path.join(tmp, "list.txt")
        with open(listing, "w") as f:
            f.writelines(f"file '{p}'\n" for p in seg_files)

        out = os.path.join(tmp, "beatsync.mp4")
        fade = min(0.6, end / 4)
        r = subprocess.run(
            ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", listing, "-i", music_path,
             "-map", "0:v", "-map", "1:a", "-c:v", "copy",
             "-af", f"afade=t=out:st={end - fade:.2f}:d={fade:.2f}",
             "-c:a", "aac", "-b:a", "192k", "-t", f"{end:.3f}", "-movflags", "+faststart", out],
            capture_output=True,
        )
        if r.returncode != 0:
            raise HTTPException(500, "Could not combine the clips with the music")

        background.add_task(shutil.rmtree, tmp, True)
        return FileResponse(
            out, media_type="video/mp4", filename="beatsync.mp4",
            headers={"X-BPM": str(bpm), "X-Cuts": str(len(plan))},
        )
    except Exception:
        shutil.rmtree(tmp, ignore_errors=True)
        raise
