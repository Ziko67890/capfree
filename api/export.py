"""Giving a finished export a home on disk, and one consistent shape.

The render itself happens in the browser, and has to: that is where the media
is -- imported footage never leaves the page, it sits behind blob: URLs the API
cannot resolve -- and where the WebGL compositor and the WebCodecs encoder are.
Handed nothing but a timeline's description, this process could not draw a
single frame of it.

What it adds is the finishing pass. WebCodecs writes whatever profile the
machine's hardware encoder happens to offer, at whatever size the timeline was
rendered at; FFmpeg re-encodes that to one known shape -- H.264 in yuv420p, AAC
at 192k, faststart, a fixed frame size and frame rate -- so a file leaving
CapFree plays everywhere, Instagram and WhatsApp included.

That is a second encode of an already-encoded file, so it costs both time and a
little quality. CRF 18 is chosen to keep the second loss below what the eye
picks up; the alternative, muxing the browser's output through untouched, would
mean shipping whatever profile the hardware happened to pick.

The file also lands somewhere the user can find it again rather than in the
browser's downloads folder, and the project's shape travels with it so the
response can describe what was rendered.
"""

import json
import os
import re
import shutil
import subprocess
import tempfile
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile

router = APIRouter()

MAX_EXPORT_MB = int(os.getenv("MAX_EXPORT_MB", "2048"))
# -preset slow over a long timeline is minutes of work, not seconds, so this
# ceiling is here to catch a wedged process rather than to bound a real one.
EXPORT_TIMEOUT_SEC = int(os.getenv("EXPORT_TIMEOUT_SEC", "3600"))

# What the editor's resolution dropdown sends, and the frame each one means.
# 16:9 throughout, because the project stage is 1920x1080 and stays there.
RESOLUTIONS = {
    "480": (854, 480),
    "720": (1280, 720),
    "1080": (1920, 1080),
    "2k": (2560, 1440),
    "4k": (3840, 2160),
}

# The format dropdown. The browser renders an intermediate and this is what it
# gets re-encoded into, so the container the editor chose and the one written
# here are the same choice.
FORMATS = {
    "mp4-h264": {"suffix": ".mp4", "vcodec": "libx264"},
    "mp4-h265": {"suffix": ".mp4", "vcodec": "libx265"},
    "webm-vp9": {"suffix": ".webm", "vcodec": "libvpx-vp9"},
}

# The audio dropdown, as (encoder, bitrate). WebM carries neither AAC nor MP3,
# so a WebM export swaps the encoder for Opus at the same bitrate; the response
# reports what ffprobe found rather than what was asked for.
AUDIO = {
    "aac-192": ("aac", "192k"),
    "aac-128": ("aac", "128k"),
    "mp3-320": ("libmp3lame", "320k"),
}
WEBM_AUDIO_CODEC = "libopus"

# CRF is the quality knob: lower is better and larger. The editor offers 14,
# 18, 23 and 28; the range here is x264's and x265's, and sits inside VP9's
# wider 0-63, so one bound covers all three.
CRF_MIN, CRF_MAX = 0, 51

UNSAFE = re.compile(r"[^A-Za-z0-9._-]+")


def check_auth(x_api_key: Optional[str]):
    api_key = os.getenv("API_KEY")
    if api_key and x_api_key != api_key:
        raise HTTPException(401, "Invalid API key")


def export_dir(override: Optional[str] = None) -> Path:
    """Where exports land. EXPORT_DIR sets it; otherwise ~/Videos/CapFree.

    `override` is the folder the export dialog's "Change" offers, and it is
    confined to the user's home directory. The API is a local process, but a
    request body is still a request body: without the check, any caller that
    reached this port could name a system path and have a file written there.
    """
    if override and override.strip():
        candidate = Path(override.strip()).expanduser()
        if not candidate.is_absolute():
            raise HTTPException(400, "The export folder must be an absolute path")
        try:
            resolved = candidate.resolve()
            home = Path.home().resolve()
        except OSError as err:
            raise HTTPException(400, f"Could not read that folder path: {err}") from err
        if resolved != home and home not in resolved.parents:
            raise HTTPException(400, "The export folder must be inside your home directory")
        target = resolved
    else:
        configured = os.getenv("EXPORT_DIR")
        target = Path(configured) if configured else Path.home() / "Videos" / "CapFree"
    try:
        target.mkdir(parents=True, exist_ok=True)
    except OSError as err:
        raise HTTPException(500, f"Could not open the export folder: {err}") from err
    return target


def safe_name(raw: Optional[str], suffix: str = ".mp4") -> str:
    """A basename the editor suggested, reduced to something safe to join.

    The suffix is the chosen format's, never the one the name carried: what
    gets written here is whatever the format dropdown says, so the name should
    not promise otherwise.
    """
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    fallback = f"capfree-export-{stamp}{suffix}"
    if not raw:
        return fallback

    # Take the last path component only: a name is a name, not a destination.
    candidate = UNSAFE.sub("-", Path(raw.replace("\\", "/")).name).strip("-.")
    if not candidate:
        return fallback
    # Leave room for the " (2)" an existing file would push on.
    return f"{Path(candidate).stem[:110]}{suffix}"


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


def ffmpeg_command(
    src: Path,
    dest: Path,
    width: int,
    height: int,
    crf: int,
    fps: int,
    fmt: str = "mp4-h264",
    audio: str = "aac-192",
) -> List[str]:
    """The encode the export dialog's five controls add up to.

    Fixed across all of them:

      yuv420p             4:2:0 is what every player, phone and social uploader
                          will take; it is why Instagram and WhatsApp accept
                          the file at all
      -vf scale / -r      the chosen frame and frame rate, forced, so the file
                          does not inherit whatever the browser rendered at

    Per codec:

      libx264 / libx265   -preset slow: more search per frame, so a smaller
                          file at the same CRF. H.265 is tagged hvc1, which is
                          the tag QuickTime and iOS will play; the hev1 default
                          is not.
      libvpx-vp9          has no -preset. It also reads -crf as a cap unless
                          -b:v 0 puts it in constant-quality mode, which is
                          what the dropdown means by quality.

    Audio follows the container: MP4 takes the dropdown's codec as-is and gets
    +faststart, which moves the moov atom to the front so the file plays before
    it has finished downloading. WebM carries neither AAC nor MP3, so it gets
    Opus at the same bitrate, and faststart does not apply to it.

    Built as a list and run without a shell, so none of these values -- the
    filename included -- is ever parsed as a command.
    """
    spec = FORMATS[fmt]
    acodec, abitrate = AUDIO[audio]
    webm = spec["suffix"] == ".webm"

    command = [
        "ffmpeg",
        "-nostdin",  # never block waiting on a console that is not there
        "-y",  # unused_path already reserved the name
        "-i", str(src),
        "-c:v", spec["vcodec"],
        "-crf", str(crf),
    ]
    if spec["vcodec"] == "libvpx-vp9":
        command += ["-b:v", "0", "-row-mt", "1", "-deadline", "good", "-cpu-used", "2"]
    else:
        command += ["-preset", "slow"]
    if spec["vcodec"] == "libx265":
        command += ["-tag:v", "hvc1"]

    command += [
        "-vf", f"scale={width}:{height}",
        "-r", str(fps),
        "-pix_fmt", "yuv420p",
        "-c:a", WEBM_AUDIO_CODEC if webm else acodec,
        "-b:a", abitrate,
    ]
    if not webm:
        command += ["-movflags", "+faststart"]

    command.append(str(dest))
    return command


def transcode(
    src: Path,
    dest: Path,
    width: int,
    height: int,
    crf: int,
    fps: int,
    fmt: str = "mp4-h264",
    audio: str = "aac-192",
) -> Optional[str]:
    """Re-encode `src` into `dest`. None on success, otherwise why not.

    Failure comes back as a value rather than an exception because there is a
    finished render at stake: the caller keeps it as it arrived instead.
    """
    try:
        result = subprocess.run(
            ffmpeg_command(src, dest, width, height, crf, fps, fmt, audio),
            capture_output=True,
            text=True,
            timeout=EXPORT_TIMEOUT_SEC,
        )
    except FileNotFoundError:
        return "FFmpeg is not installed on the API host"
    except subprocess.TimeoutExpired:
        dest.unlink(missing_ok=True)
        return f"FFmpeg did not finish within {EXPORT_TIMEOUT_SEC}s"

    if result.returncode != 0:
        dest.unlink(missing_ok=True)
        # ffmpeg puts the reason on its last line; everything above is banner.
        lines = [line for line in (result.stderr or "").strip().splitlines() if line.strip()]
        return f"FFmpeg failed: {lines[-1] if lines else 'no output'}"

    if not dest.exists() or dest.stat().st_size == 0:
        dest.unlink(missing_ok=True)
        return "FFmpeg exited cleanly but wrote nothing"
    return None


def probe(path: Path) -> dict:
    """What actually ended up in the file: duration, frame size, codecs.

    Read back from the written file rather than assumed from the flags, so the
    editor reports what is on disk. All None when ffprobe cannot say.
    """
    unknown = {
        "duration": None,
        "width": None,
        "height": None,
        "video_codec": None,
        "audio_codec": None,
    }
    try:
        result = subprocess.run(
            [
                "ffprobe", "-v", "quiet", "-print_format", "json",
                "-show_format", "-show_streams", str(path),
            ],
            capture_output=True,
            text=True,
            timeout=60,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return unknown
    if result.returncode != 0:
        return unknown
    try:
        data = json.loads(result.stdout)
    except ValueError:
        return unknown

    streams = data.get("streams", [])
    video = next((s for s in streams if s.get("codec_type") == "video"), None)
    audio = next((s for s in streams if s.get("codec_type") == "audio"), None)
    try:
        duration = round(float(data["format"]["duration"]), 2)
    except (KeyError, ValueError, TypeError):
        duration = None

    return {
        "duration": duration,
        "width": video.get("width") if video else None,
        "height": video.get("height") if video else None,
        "video_codec": video.get("codec_name") if video else None,
        "audio_codec": audio.get("codec_name") if audio else None,
    }


@router.post("/export")
def export(
    file: UploadFile = File(...),
    fps: int = Form(30),
    width: int = Form(0),
    height: int = Form(0),
    tracks: int = Form(0),
    clips: int = Form(0),
    name: Optional[str] = Form(None),
    resolution: str = Form("1080"),
    quality: int = Form(23),
    format: str = Form("mp4-h264"),
    audio: str = Form("aac-192"),
    folder: Optional[str] = Form(None),
    x_api_key: Optional[str] = Header(None),
):
    """Transcode a rendered export to the chosen profile and say where it went.

    `file` is the finished video from the browser. `resolution`, `quality` (an
    x264/x265/VP9 CRF), `fps`, `format` and `audio` are the export dialog's
    controls; `folder` is its "Change", confined to the user's home directory.
    The rest describes the project the render came from and is echoed back, so
    the editor can show what it saved without keeping its own record of it.
    """
    check_auth(x_api_key)
    if not 1 <= fps <= 240:
        raise HTTPException(400, "fps must be between 1 and 240")
    if width < 0 or height < 0 or width > 7680 or height > 7680:
        raise HTTPException(400, "width and height must be between 0 and 7680")
    if resolution not in RESOLUTIONS:
        raise HTTPException(400, f"resolution must be one of: {', '.join(RESOLUTIONS)}")
    if not CRF_MIN <= quality <= CRF_MAX:
        raise HTTPException(400, f"quality (CRF) must be between {CRF_MIN} and {CRF_MAX}")
    if format not in FORMATS:
        raise HTTPException(400, f"format must be one of: {', '.join(FORMATS)}")
    if audio not in AUDIO:
        raise HTTPException(400, f"audio must be one of: {', '.join(AUDIO)}")

    out_width, out_height = RESOLUTIONS[resolution]
    crf = quality
    suffix = FORMATS[format]["suffix"]

    destination = export_dir(folder)
    dest = unused_path(destination, safe_name(name or file.filename, suffix))

    # The upload lands in a temp file first and FFmpeg writes the finished one
    # into the export folder, so a failed encode never leaves a half-written
    # video sitting where the user goes looking for their export.
    staging = Path(tempfile.mkdtemp(prefix="capfree-export-"))
    source = staging / "upload"
    try:
        stream_to(file, source)
        problem = transcode(source, dest, out_width, out_height, crf, fps, format, audio)
        if problem:
            # Keep the render rather than lose it to a missing or unhappy
            # FFmpeg. The browser already wrote H.264/AAC -- just not at the
            # size, rate and CRF that were asked for -- so the file is still
            # worth having, and the response says it was not transcoded.
            shutil.move(str(source), str(dest))
    finally:
        shutil.rmtree(staging, ignore_errors=True)

    media = probe(dest)
    return {
        "path": str(dest),
        "folder": str(destination),
        "filename": dest.name,
        "bytes": dest.stat().st_size,
        "duration": media["duration"],
        "fps": fps,
        # What is on disk, which after a transcode is the frame that was asked
        # for rather than the size the browser rendered at.
        "width": media["width"] or width,
        "height": media["height"] or height,
        "tracks": tracks,
        "clips": clips,
        "resolution": resolution,
        "quality": quality,
        "crf": crf,
        "format": format,
        "audio": audio,
        "video_codec": media["video_codec"],
        "audio_codec": media["audio_codec"],
        "transcoded": problem is None,
        "warning": problem,
    }


@router.get("/export/folder")
def export_folder(x_api_key: Optional[str] = Header(None)):
    """Where exports would be saved, and how much room is left there."""
    check_auth(x_api_key)
    folder = export_dir()
    usage = shutil.disk_usage(folder)
    return {"folder": str(folder), "free_bytes": usage.free}
