"""Caption translation and burned-in subtitles."""

import os
import re
import shutil
import subprocess
import tempfile
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse

from silence import check_auth, probe, save_upload

router = APIRouter()

# deep-translator language codes. Names and codes both accepted.
LANGS = {
    "spanish": "es",
    "es": "es",
    "french": "fr",
    "fr": "fr",
    "portuguese": "pt",
    "pt": "pt",
    "hindi": "hi",
    "hi": "hi",
    "arabic": "ar",
    "ar": "ar",
    "chinese": "zh-CN",
    "zh": "zh-CN",
    "zh-cn": "zh-CN",
    "japanese": "ja",
    "ja": "ja",
    "korean": "ko",
    "ko": "ko",
    "german": "de",
    "de": "de",
    "italian": "it",
    "it": "it",
    "russian": "ru",
    "ru": "ru",
    "dutch": "nl",
    "nl": "nl",
    "turkish": "tr",
    "tr": "tr",
    "english": "en",
    "en": "en",
}

ALIGN = {"bottom": 2, "middle": 5, "top": 8}

# MyMemory wants language names, and it still works when Google rate-limits.
MEMORY_NAMES = {
    "es": "spanish",
    "fr": "french",
    "pt": "portuguese",
    "hi": "hindi",
    "ar": "arabic",
    "zh-CN": "chinese simplified",
    "ja": "japanese",
    "ko": "korean",
    "de": "german",
    "it": "italian",
    "ru": "russian",
    "nl": "dutch",
    "tr": "turkish",
    "en": "english",
}


def _one(translator, line: str) -> str:
    if not line.strip():
        return ""
    result = translator.translate(line)
    if isinstance(result, list):
        result = " ".join(str(part) for part in result)
    return result or ""


def _translate_lines(lines: list, source_code: str, target_code: str) -> list:
    """Prefer Google. Fall back to MyMemory so a rate limit still returns text."""
    try:
        from deep_translator import GoogleTranslator

        translator = GoogleTranslator(source=source_code, target=target_code)
        return [_one(translator, line) for line in lines]
    except Exception:
        from deep_translator import MyMemoryTranslator

        source_name = "english" if source_code == "auto" else MEMORY_NAMES.get(source_code)
        target_name = MEMORY_NAMES.get(target_code)
        if not source_name or not target_name:
            raise
        translator = MyMemoryTranslator(source=source_name, target=target_name)
        return [_one(translator, line) for line in lines]


def _lang(value: str, fallback: str) -> str:
    code = LANGS.get(value.strip().lower())
    if not code:
        raise HTTPException(400, f"Unsupported language: {value}")
    return code or fallback


@router.post("/translate")
def translate_text(
    text: str = Form(...),
    target: str = Form(...),
    source: str = Form("auto"),
    x_api_key: Optional[str] = Header(None),
):
    """Translate caption text. `source` may be `auto` or a language name."""
    check_auth(x_api_key)
    body = text.strip("\n")
    if not body.strip():
        raise HTTPException(400, "Text is empty")
    if len(body) > 8000:
        raise HTTPException(400, "Text is too long (max 8000 characters)")

    target_code = _lang(target, "es")
    source_raw = source.strip().lower()
    source_code = "auto" if source_raw in ("", "auto", "auto detect") else _lang(source, "auto")

    lines = body.split("\n")
    try:
        translated = _translate_lines(lines, source_code, target_code)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(502, f"Translation failed ({exc.__class__.__name__})")

    return {
        "source": source_code,
        "target": target_code,
        "text": "\n".join(translated),
        "lines": translated,
    }


@router.post("/subtitles/burn")
def burn_subtitles(
    background: BackgroundTasks,
    file: UploadFile = File(...),
    srt: str = Form(...),
    font_size: int = Form(28),
    position: str = Form("bottom"),
    font: str = Form("Arial"),
    x_api_key: Optional[str] = Header(None),
):
    """Burn an SRT string into the video with ffmpeg's subtitles filter."""
    check_auth(x_api_key)
    if not srt.strip():
        raise HTTPException(400, "Subtitle text is empty")
    if len(srt) > 200_000:
        raise HTTPException(400, "Subtitle file is too large")

    alignment = ALIGN.get(position.strip().lower())
    if alignment is None:
        raise HTTPException(400, "position must be top, middle, or bottom")
    size = max(8, min(int(font_size), 120))
    font_name = re.sub(r"[^A-Za-z0-9 ]", "", font).strip() or "Arial"

    tmp = tempfile.mkdtemp()
    try:
        src = os.path.join(tmp, "input")
        save_upload(file, src)
        _duration, has_video, has_audio = probe(src)
        if not has_video:
            raise HTTPException(400, "Send a video file")

        srt_path = os.path.join(tmp, "subs.srt")
        with open(srt_path, "w", encoding="utf-8") as handle:
            handle.write(srt if srt.endswith("\n") else srt + "\n")

        # Relative filename so the filter does not have to escape a Windows drive letter.
        style = f"FontName={font_name},FontSize={size},Alignment={alignment},MarginV=40"
        out = os.path.join(tmp, "burned.mp4")
        cmd = [
            "ffmpeg", "-y", "-i", src,
            "-vf", f"subtitles=subs.srt:force_style='{style}'",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
        ]
        if has_audio:
            cmd += ["-c:a", "copy"]
        cmd += ["-movflags", "+faststart", out]
        result = subprocess.run(cmd, cwd=tmp, capture_output=True)
        if result.returncode != 0 or not os.path.exists(out):
            raise HTTPException(500, "Failed to burn subtitles into the video")

        background.add_task(shutil.rmtree, tmp, True)
        return FileResponse(out, media_type="video/mp4", filename="subtitled.mp4")
    except Exception:
        shutil.rmtree(tmp, ignore_errors=True)
        raise
