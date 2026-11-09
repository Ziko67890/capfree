import os
import subprocess
import tempfile
from functools import lru_cache
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

# Loaded before anything reads os.getenv. The keys live in the project root's
# .env next to Next's copy, so uvicorn started from api/ still finds them;
# override=False means a real environment variable always wins.
for _env in (Path(__file__).resolve().parent / ".env", Path(__file__).resolve().parent.parent / ".env"):
    if _env.is_file():
        load_dotenv(_env, override=False)

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse

from ai import router as ai_router
from beats import router as beats_router
from fillers import router as fillers_router
from media import router as media_router
from music import router as music_router
from removebg import router as removebg_router
from silence import router as silence_router
from tracking import router as tracking_router
from tts import router as tts_router
from translate import router as translate_router
from upscale import router as upscale_router
from vocals import router as vocals_router

MODEL_SIZE = os.getenv("WHISPER_MODEL", "base")  # tiny | base | small | medium | large-v3
MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "200"))
API_KEY = os.getenv("API_KEY")  # optional: set to require x-api-key header

app = FastAPI(title="CapFree API", description="Backend for the CapFree video editor")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(silence_router)
app.include_router(fillers_router)
app.include_router(music_router)
app.include_router(media_router)
app.include_router(ai_router)
app.include_router(removebg_router)
app.include_router(beats_router)
app.include_router(tts_router)
app.include_router(tracking_router)
app.include_router(vocals_router)
app.include_router(upscale_router)
app.include_router(translate_router)


@lru_cache(maxsize=1)
def get_model():
    from faster_whisper import WhisperModel

    return WhisperModel(MODEL_SIZE, device="cpu", compute_type="int8")


def _timestamp(t: float, sep: str) -> str:
    ms = int(round(t * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02}:{m:02}:{s:02}{sep}{ms:03}"


def group_words(words, max_words=4, max_gap=0.8):
    """Group word timestamps into short caption lines (TikTok-style)."""
    captions, chunk = [], []

    def flush():
        if chunk:
            captions.append(
                {
                    "start": chunk[0]["start"],
                    "end": chunk[-1]["end"],
                    "text": " ".join(w["word"] for w in chunk),
                    "words": list(chunk),
                }
            )
            chunk.clear()

    for w in words:
        if chunk and w["start"] - chunk[-1]["end"] > max_gap:
            flush()
        chunk.append(w)
        if len(chunk) >= max_words or w["word"].endswith((".", "?", "!")):
            flush()
    flush()
    return captions


def to_srt(captions) -> str:
    blocks = []
    for i, c in enumerate(captions, 1):
        blocks.append(
            f"{i}\n{_timestamp(c['start'], ',')} --> {_timestamp(c['end'], ',')}\n{c['text']}\n"
        )
    return "\n".join(blocks)


def to_vtt(captions) -> str:
    blocks = ["WEBVTT\n"]
    for c in captions:
        blocks.append(
            f"{_timestamp(c['start'], '.')} --> {_timestamp(c['end'], '.')}\n{c['text']}\n"
        )
    return "\n".join(blocks)


def extract_audio(src: str, dst: str):
    cmd = ["ffmpeg", "-y", "-i", src, "-vn", "-ac", "1", "-ar", "16000", dst]
    result = subprocess.run(cmd, capture_output=True)
    if result.returncode != 0:
        raise HTTPException(400, "Could not read audio from this file")


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL_SIZE}


@app.post("/captions")
def captions(
    file: UploadFile = File(...),
    language: Optional[str] = Form(None),
    format: str = Form("json"),
    max_words: int = Form(4),
    x_api_key: Optional[str] = Header(None),
):
    if API_KEY and x_api_key != API_KEY:
        raise HTTPException(401, "Invalid API key")
    if format not in ("json", "srt", "vtt"):
        raise HTTPException(400, "format must be json, srt or vtt")

    with tempfile.TemporaryDirectory() as tmp:
        src = os.path.join(tmp, "input")
        size = 0
        with open(src, "wb") as out:
            while chunk := file.file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_UPLOAD_MB * 1024 * 1024:
                    raise HTTPException(413, f"File too large (max {MAX_UPLOAD_MB} MB)")
                out.write(chunk)

        wav = os.path.join(tmp, "audio.wav")
        extract_audio(src, wav)

        segments, info = get_model().transcribe(
            wav, language=language or None, word_timestamps=True, vad_filter=True
        )
        words = [
            {"word": w.word.strip(), "start": round(w.start, 2), "end": round(w.end, 2)}
            for seg in segments
            for w in (seg.words or [])
        ]

    lines = group_words(words, max_words=max(1, max_words))

    if format == "srt":
        return PlainTextResponse(to_srt(lines))
    if format == "vtt":
        return PlainTextResponse(to_vtt(lines), media_type="text/vtt")
    return {
        "language": info.language,
        "duration": round(info.duration, 2),
        "captions": lines,
    }
