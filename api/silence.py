import json
import os
import shutil
import subprocess
import tempfile
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse

router = APIRouter()

MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "200"))


def save_upload(upload: UploadFile, dest: str):
    """Stream an uploaded file to disk, enforcing the size limit."""
    size = 0
    with open(dest, "wb") as f:
        while chunk := upload.file.read(1024 * 1024):
            size += len(chunk)
            if size > MAX_UPLOAD_MB * 1024 * 1024:
                raise HTTPException(413, f"File too large (max {MAX_UPLOAD_MB} MB)")
            f.write(chunk)


def probe(path: str):
    """Return (duration, has_video, has_audio) for a media file using ffprobe."""
    cmd = [
        "ffprobe", "-v", "quiet", "-print_format", "json",
        "-show_format", "-show_streams", path,
    ]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise HTTPException(400, "Could not read this media file")
    info = json.loads(r.stdout)
    duration = float(info.get("format", {}).get("duration", 0))
    streams = info.get("streams", [])
    has_video = any(s["codec_type"] == "video" for s in streams)
    has_audio = any(s["codec_type"] == "audio" for s in streams)
    return duration, has_video, has_audio


def detect_silences(path: str, threshold_db: float = -30, min_duration: float = 0.5):
    """Use ffmpeg silencedetect filter to find silent segments."""
    cmd = [
        "ffmpeg", "-i", path, "-af",
        f"silencedetect=noise={threshold_db}dB:d={min_duration}",
        "-f", "null", "-",
    ]
    r = subprocess.run(cmd, capture_output=True, text=True)
    stderr = r.stderr

    silences = []
    start = None
    for line in stderr.split("\n"):
        if "silence_start:" in line:
            start = float(line.split("silence_start:")[1].strip().split()[0])
        elif "silence_end:" in line and start is not None:
            parts = line.split("silence_end:")[1].strip().split()
            end = float(parts[0])
            silences.append({"start": round(start, 3), "end": round(end, 3),
                             "duration": round(end - start, 3)})
            start = None
    return silences


def cut_silences(src: str, dst: str, silences: list, duration: float, padding: float = 0.05):
    """Re-encode the file keeping only the non-silent segments."""
    if not silences:
        shutil.copy2(src, dst)
        return

    keeps = []
    cursor = 0.0
    for s in silences:
        seg_start = cursor
        seg_end = max(cursor, s["start"] - padding)
        if seg_end - seg_start > 0.05:
            keeps.append((seg_start, seg_end))
        cursor = s["end"] + padding
    if cursor < duration:
        keeps.append((cursor, duration))

    if not keeps:
        shutil.copy2(src, dst)
        return

    filter_parts = []
    concat_inputs = []
    for i, (a, b) in enumerate(keeps):
        filter_parts.append(f"[0:v]trim=start={a:.3f}:end={b:.3f},setpts=PTS-STARTPTS[v{i}];")
        filter_parts.append(f"[0:a]atrim=start={a:.3f}:end={b:.3f},asetpts=PTS-STARTPTS[a{i}];")
        concat_inputs.append(f"[v{i}][a{i}]")
    n = len(keeps)
    filter_parts.append(f"{''.join(concat_inputs)}concat=n={n}:v=1:a=1[outv][outa]")
    filtergraph = "".join(filter_parts)

    cmd = [
        "ffmpeg", "-y", "-i", src,
        "-filter_complex", filtergraph,
        "-map", "[outv]", "-map", "[outa]",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
        "-c:a", "aac", "-b:a", "192k",
        "-movflags", "+faststart", dst,
    ]
    r = subprocess.run(cmd, capture_output=True)
    if r.returncode != 0:
        raise HTTPException(500, "Failed to cut silences from the video")


def _chosen_segments(raw: str) -> list:
    """JSON list of {start, end} ranges the caller wants cut out, in order."""
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(400, "segments must be JSON")
    if not isinstance(parsed, list) or not parsed:
        raise HTTPException(400, "segments must be a non-empty list")
    chosen = []
    for item in parsed:
        if not isinstance(item, dict) or "start" not in item or "end" not in item:
            raise HTTPException(400, "each segment needs start and end")
        start = float(item["start"])
        end = float(item["end"])
        if end <= start:
            continue
        chosen.append({"start": start, "end": end})
    if not chosen:
        raise HTTPException(400, "No valid segments to remove")
    return sorted(chosen, key=lambda s: s["start"])


def check_auth(x_api_key: Optional[str]):
    api_key = os.getenv("API_KEY")
    if api_key and x_api_key != api_key:
        raise HTTPException(401, "Invalid API key")


@router.post("/silence/detect")
def silence_detect(
    file: UploadFile = File(...),
    threshold_db: float = Form(-30),
    min_duration: float = Form(0.5),
    x_api_key: Optional[str] = Header(None),
):
    """Detect silent segments in a video or audio file."""
    check_auth(x_api_key)
    with tempfile.TemporaryDirectory() as tmp:
        src = os.path.join(tmp, "input")
        save_upload(file, src)
        duration, _, has_audio = probe(src)
        if not has_audio:
            raise HTTPException(400, "This file has no audio track")
        silences = detect_silences(src, threshold_db, min_duration)
        return {
            "duration": round(duration, 2),
            "silences": silences,
            "total_silence": round(sum(s["duration"] for s in silences), 2),
        }


@router.post("/silence/remove")
def silence_remove(
    background: BackgroundTasks,
    file: UploadFile = File(...),
    threshold_db: float = Form(-30),
    min_duration: float = Form(0.5),
    padding: float = Form(0.05),
    segments: Optional[str] = Form(None),
    x_api_key: Optional[str] = Header(None),
):
    """Remove silent segments from a video and return the trimmed file.

    Pass `segments` as a JSON list of {start, end} to cut exactly those ranges
    instead of detecting silence. Omit it to keep the old behavior.
    """
    check_auth(x_api_key)
    tmp = tempfile.mkdtemp()
    try:
        src = os.path.join(tmp, "input")
        save_upload(file, src)
        duration, has_video, has_audio = probe(src)
        if not has_audio:
            raise HTTPException(400, "This file has no audio track")
        if segments and segments.strip():
            cuts = _chosen_segments(segments)
        else:
            cuts = detect_silences(src, threshold_db, min_duration)
        out = os.path.join(tmp, "trimmed.mp4")
        cut_silences(src, out, cuts, duration, padding)
        background.add_task(shutil.rmtree, tmp, True)
        return FileResponse(out, media_type="video/mp4", filename="trimmed.mp4")
    except Exception:
        shutil.rmtree(tmp, ignore_errors=True)
        raise
