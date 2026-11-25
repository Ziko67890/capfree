"""Giving a finished export a home on disk.

The render itself happens in the browser, and has to: that is where the media
is — imported footage never leaves the page, it sits behind blob: URLs the API
cannot resolve — and where the WebGL compositor and the WebCodecs encoder are.
Handed nothing but a timeline's description, this process could not draw a
single frame of it.

What it can do is take the file the editor produced, put it somewhere the user
can find again instead of the browser's downloads folder, and say where that
was. The project's shape comes along with it so the response can describe what
was rendered, and so a future server-side renderer has the same entry point.
"""

import os
import re
import shutil
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile

router = APIRouter()

MAX_EXPORT_MB = int(os.getenv("MAX_EXPORT_MB", "2048"))

# Only containers the editor actually writes.
SUFFIXES = {".mp4": "video/mp4", ".webm": "video/webm", ".mkv": "video/x-matroska"}

UNSAFE = re.compile(r"[^A-Za-z0-9._-]+")


def check_auth(x_api_key: Optional[str]):
    api_key = os.getenv("API_KEY")
    if api_key and x_api_key != api_key:
        raise HTTPException(401, "Invalid API key")


def export_dir() -> Path:
    """Where exports land. EXPORT_DIR overrides; otherwise ~/Videos/CapFree."""
    configured = os.getenv("EXPORT_DIR")
    target = Path(configured) if configured else Path.home() / "Videos" / "CapFree"
    try:
        target.mkdir(parents=True, exist_ok=True)
    except OSError as err:
        raise HTTPException(500, f"Could not open the export folder: {err}") from err
    return target


def safe_name(raw: Optional[str]) -> str:
    """A basename the editor suggested, reduced to something safe to join."""
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    fallback = f"capfree-export-{stamp}.mp4"
    if not raw:
        return fallback

    # Take the last path component only: a name is a name, not a destination.
    candidate = UNSAFE.sub("-", Path(raw.replace("\\", "/")).name).strip("-.")
    if not candidate:
        return fallback
    suffix = Path(candidate).suffix.lower()
    if suffix not in SUFFIXES:
        candidate = f"{Path(candidate).stem}.mp4"
    # Leave room for the " (2)" an existing file would push on.
    return candidate[:120]


def unused_path(folder: Path, filename: str) -> Path:
    """`filename`, or the next free "name (2).mp4" beside it."""
    candidate = folder / filename
    if not candidate.exists():
        return candidate
    stem, suffix = Path(filename).stem, Path(filename).suffix
    for n in range(2, 1000):
        candidate = folder / f"{stem} ({n}){suffix}"
        if not candidate.exists():
            return candidate
    raise HTTPException(500, "Too many files with that name in the export folder")


def stream_to(upload: UploadFile, dest: Path) -> int:
    """Copy the upload to `dest` in chunks, enforcing the size cap."""
    size = 0
    limit = MAX_EXPORT_MB * 1024 * 1024
    try:
        with open(dest, "wb") as out:
            while chunk := upload.file.read(1024 * 1024):
                size += len(chunk)
                if size > limit:
                    raise HTTPException(413, f"Export too large (max {MAX_EXPORT_MB} MB)")
                out.write(chunk)
    except HTTPException:
        dest.unlink(missing_ok=True)
        raise
    except OSError as err:
        dest.unlink(missing_ok=True)
        raise HTTPException(500, f"Could not write the export: {err}") from err
    if size == 0:
        dest.unlink(missing_ok=True)
        raise HTTPException(400, "The export was empty")
    return size


def duration_of(path: Path) -> Optional[float]:
    """Seconds, read back from the file that was just written. None if unknown."""
    r = subprocess.run(
        [
            "ffprobe", "-v", "quiet", "-print_format", "json",
            "-show_entries", "format=duration", str(path),
        ],
        capture_output=True,
        text=True,
    )
    if r.returncode != 0:
        return None
    try:
        import json

        return round(float(json.loads(r.stdout)["format"]["duration"]), 2)
    except (KeyError, ValueError, TypeError):
        return None


@router.post("/export")
def export(
    file: UploadFile = File(...),
    fps: int = Form(30),
    width: int = Form(0),
    height: int = Form(0),
    tracks: int = Form(0),
    clips: int = Form(0),
    name: Optional[str] = Form(None),
    x_api_key: Optional[str] = Header(None),
):
    """Store a rendered export and report where it went.

    `file` is the finished video. The rest describes the project it came from
    and is echoed back, so the editor can show what it saved without keeping
    its own record of it.
    """
    check_auth(x_api_key)
    if not 1 <= fps <= 240:
        raise HTTPException(400, "fps must be between 1 and 240")
    if width < 0 or height < 0 or width > 7680 or height > 7680:
        raise HTTPException(400, "width and height must be between 0 and 7680")

    folder = export_dir()
    dest = unused_path(folder, safe_name(name or file.filename))
    size = stream_to(file, dest)

    return {
        "path": str(dest),
        "folder": str(folder),
        "filename": dest.name,
        "bytes": size,
        "duration": duration_of(dest),
        "fps": fps,
        "width": width,
        "height": height,
        "tracks": tracks,
        "clips": clips,
    }


@router.get("/export/folder")
def export_folder(x_api_key: Optional[str] = Header(None)):
    """Where exports would be saved, and how much room is left there."""
    check_auth(x_api_key)
    folder = export_dir()
    usage = shutil.disk_usage(folder)
    return {"folder": str(folder), "free_bytes": usage.free}
