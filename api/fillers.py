import json
import os
import shutil
import subprocess
import tempfile
from functools import lru_cache
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse

from silence import check_auth, probe, save_upload

router = APIRouter()

FILLER_WORDS = {
    "um", "uh", "uhm", "umm", "hmm", "hm",
    "er", "err", "ah", "ahh", "eh",
    "like", "you know", "i mean", "basically",
    "actually", "literally", "right", "so", "well",
}


@lru_cache(maxsize=1)
def _get_model():
    from faster_whisper import WhisperModel

    model_size = os.getenv("WHISPER_MODEL", "base")
    return WhisperModel(model_size, device="cpu", compute_type="int8")


def extract_audio(src: str, dst: str):
    cmd = ["ffmpeg", "-y", "-i", src, "-vn", "-ac", "1", "-ar", "16000", dst]
    r = subprocess.run(cmd, capture_output=True)
    if r.returncode != 0:
        raise HTTPException(400, "Could not extract audio from this file")


def find_fillers(wav_path: str, language: Optional[str] = None, extra_words: Optional[list] = None):
    """Transcribe with word timestamps and flag filler words."""
    model = _get_model()
    segments, info = model.transcribe(
        wav_path, language=language or None, word_timestamps=True, vad_filter=True
    )

    targets = FILLER_WORDS.copy()
    if extra_words:
        targets.update(w.lower().strip() for w in extra_words)

    fillers = []
    for seg in segments:
        for w in (seg.words or []):
            cleaned = w.word.strip().lower().strip(".,!?;:")
            if cleaned in targets:
                fillers.append({
                    "word": w.word.strip(),
                    "start": round(w.start, 3),
                    "end": round(w.end, 3),
                })
    return fillers, info


def cut_segments(src: str, dst: str, segments_to_remove: list, duration: float, padding: float):
    """Remove the given time segments from the video."""
    if not segments_to_remove:
        shutil.copy2(src, dst)
        return

    keeps = []
    cursor = 0.0
    for s in sorted(segments_to_remove, key=lambda x: x["start"]):
        seg_start = cursor
        seg_end = max(cursor, s["start"] - padding)
        if seg_end - seg_start > 0.03:
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
        raise HTTPException(500, "Failed to cut filler words from the video")


def _extra_words(raw: Optional[str]) -> Optional[list]:
    """Comma-separated words the caller wants treated as fillers."""
    if not raw:
        return None
    words = [part.strip() for part in raw.split(",") if part.strip()]
    return words or None


def _chosen_segments(raw: str) -> list:
    """JSON list of {start, end} ranges the caller wants removed."""
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
    return chosen


@router.post("/fillers/detect")
def fillers_detect(
    file: UploadFile = File(...),
    language: Optional[str] = Form(None),
    extra: Optional[str] = Form(None),
    x_api_key: Optional[str] = Header(None),
):
    """Detect filler words (um, uh, like, etc.) with their timestamps."""
    check_auth(x_api_key)
    with tempfile.TemporaryDirectory() as tmp:
        src = os.path.join(tmp, "input")
        save_upload(file, src)
        wav = os.path.join(tmp, "audio.wav")
        extract_audio(src, wav)
        fillers, info = find_fillers(wav, language, _extra_words(extra))
        return {
            "language": info.language,
            "duration": round(info.duration, 2),
            "fillers": fillers,
            "count": len(fillers),
        }


@router.post("/fillers/remove")
def fillers_remove(
    background: BackgroundTasks,
    file: UploadFile = File(...),
    language: Optional[str] = Form(None),
    padding: float = Form(0.03),
    extra: Optional[str] = Form(None),
    segments: Optional[str] = Form(None),
    x_api_key: Optional[str] = Header(None),
):
    """Remove filler words from the video and return the trimmed file.

    Pass `segments` as a JSON list of {start, end} to cut those ranges
    instead of re-detecting every filler. Omit it to keep the old behavior.
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
            fillers = _chosen_segments(segments)
        else:
            wav = os.path.join(tmp, "audio.wav")
            extract_audio(src, wav)
            fillers, _ = find_fillers(wav, language, _extra_words(extra))

        out = os.path.join(tmp, "cleaned.mp4")
        cut_segments(src, out, fillers, duration, padding)
        background.add_task(shutil.rmtree, tmp, True)
        return FileResponse(out, media_type="video/mp4", filename="cleaned.mp4")
    except Exception:
        shutil.rmtree(tmp, ignore_errors=True)
        raise
