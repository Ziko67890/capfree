"""Vocal isolation with Demucs (htdemucs)."""

import os
import shutil
import subprocess
import tempfile
import threading
from functools import lru_cache
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, File, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse

from silence import check_auth, probe, save_upload

router = APIRouter()

# One shared model. Inference is not safe to run on two requests at once.
_lock = threading.Lock()


@lru_cache(maxsize=1)
def get_separator():
    """Load htdemucs once. Weights download on the first call."""
    from demucs.api import Separator

    # The rest of the API runs on CPU; the Docker image has no GPU.
    return Separator(model="htdemucs", device="cpu", progress=False)


def _stem_wave(stems: dict, stem: str):
    """Pick vocals, or the accompaniment (every other stem added together)."""
    if "vocals" not in stems:
        raise HTTPException(500, "Demucs did not return a vocals stem")
    vocals = stems["vocals"]
    if stem == "vocals":
        return vocals
    # Same mix Demucs writes as no_vocals with --two-stems vocals.
    music = vocals * 0
    for name, source in stems.items():
        if name != "vocals":
            music = music + source
    return music


def separate(src: str, stem: str):
    """Run htdemucs and return (waveform, samplerate) for the requested stem."""
    from demucs.api import LoadAudioError

    with _lock:
        try:
            separator = get_separator()
        except Exception:
            raise HTTPException(500, "Could not load the Demucs model") from None
        try:
            _origin, stems = separator.separate_audio_file(Path(src))
        except LoadAudioError:
            raise HTTPException(400, "Could not read audio from this file") from None
        except Exception:
            raise HTTPException(500, "Vocal separation failed") from None
        audio = _stem_wave(stems, stem).detach().cpu().clone()
        return audio, separator.samplerate


def write_mp3(wav, dest: str, samplerate: int):
    """Encode a Demucs waveform to a 192 kbps MP3 with ffmpeg."""
    import torch

    if wav.numel() == 0:
        raise HTTPException(400, "This file has no audio track")
    pcm = wav.detach().cpu().float()
    peak = float(pcm.abs().max())
    if peak > 0.99:
        pcm = pcm / (peak * 1.01)
    if pcm.ndim == 1:
        pcm = pcm.unsqueeze(0)
    # s16le interleaved: shape (samples, channels)
    interleaved = (
        pcm.clamp(-1, 1).mul(32767).round().to(torch.int16).transpose(0, 1).contiguous()
    )
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-f", "s16le", "-ar", str(samplerate), "-ac", str(pcm.shape[0]),
        "-i", "pipe:0",
        "-c:a", "libmp3lame", "-b:a", "192k",
        dest,
    ]
    result = subprocess.run(cmd, input=interleaved.numpy().tobytes(), capture_output=True)
    if result.returncode != 0:
        raise HTTPException(500, "Could not encode the separated audio")


def _export(background: BackgroundTasks, file: UploadFile, stem: str, filename: str):
    tmp = tempfile.mkdtemp()
    try:
        src = os.path.join(tmp, "input")
        save_upload(file, src)
        _, _, has_audio = probe(src)
        if not has_audio:
            raise HTTPException(400, "This file has no audio track")
        audio, samplerate = separate(src, stem)
        out = os.path.join(tmp, filename)
        write_mp3(audio, out, samplerate)
        background.add_task(shutil.rmtree, tmp, True)
        return FileResponse(out, media_type="audio/mpeg", filename=filename)
    except Exception:
        shutil.rmtree(tmp, ignore_errors=True)
        raise


@router.post("/vocals/isolate")
def vocals_isolate(
    background: BackgroundTasks,
    file: UploadFile = File(...),
    x_api_key: Optional[str] = Header(None),
):
    """Separate a video or audio file and return the vocals as MP3."""
    check_auth(x_api_key)
    return _export(background, file, "vocals", "vocals.mp3")


@router.post("/vocals/music")
def vocals_music(
    background: BackgroundTasks,
    file: UploadFile = File(...),
    x_api_key: Optional[str] = Header(None),
):
    """Separate a video or audio file and return the accompaniment as MP3."""
    check_auth(x_api_key)
    return _export(background, file, "music", "music.mp3")
