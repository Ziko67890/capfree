"""Image and video upscaling with Real-ESRGAN (x4plus)."""

import json
import os
import shutil
import subprocess
import tempfile
import threading
from functools import lru_cache
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse

from silence import check_auth, save_upload

router = APIRouter()

# x4plus is the general Real-ESRGAN model. outscale 2 or 3 resizes that result.
MODEL_URL = "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth"
# Tile so a full frame is not one tensor. CPU inference otherwise runs out of memory.
TILE = 256
# A few hundred frames of x4plus on CPU is already a long request.
MAX_SECONDS = 30
MAX_FRAMES = 300

# One shared model. enhance() keeps state on the upsampler, so requests take turns.
_lock = threading.Lock()


@lru_cache(maxsize=1)
def get_upsampler():
    """Load RealESRGAN_x4plus once. Weights download on the first call."""
    import torch
    from basicsr.archs.rrdbnet_arch import RRDBNet
    from realesrgan import RealESRGANer

    model = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=4)
    return RealESRGANer(
        scale=4,
        model_path=MODEL_URL,
        model=model,
        tile=TILE,
        tile_pad=10,
        pre_pad=0,
        half=False,  # fp16 is for CUDA; this API runs on CPU
        device=torch.device("cpu"),
    )


def is_still_image(path: str) -> bool:
    """True for a single-frame image. Matches the check used by beat-sync."""
    from PIL import Image, UnidentifiedImageError

    try:
        with Image.open(path) as im:
            return getattr(im, "n_frames", 1) == 1
    except (UnidentifiedImageError, OSError):
        return False


def load_image(path: str):
    """Read an image as a BGR or BGRA array, which is what Real-ESRGAN expects."""
    import numpy as np
    from PIL import Image, ImageOps, UnidentifiedImageError

    try:
        with Image.open(path) as im:
            im = ImageOps.exif_transpose(im)
            if im.mode == "P":
                im = im.convert("RGBA")
            elif im.mode not in ("RGB", "RGBA", "L"):
                im = im.convert("RGB")
            arr = np.array(im)
    except (UnidentifiedImageError, OSError):
        raise HTTPException(400, "Could not read this image") from None
    if arr.ndim == 2:
        return arr
    if arr.shape[2] == 4:
        return np.ascontiguousarray(arr[:, :, [2, 1, 0, 3]])
    return np.ascontiguousarray(arr[:, :, ::-1])


def save_png(arr, dest: str):
    """Write a BGR or BGRA array to a PNG."""
    import numpy as np
    from PIL import Image

    if arr.ndim == 2:
        image = Image.fromarray(arr)
    elif arr.shape[2] == 4:
        image = Image.fromarray(np.ascontiguousarray(arr[:, :, [2, 1, 0, 3]]), mode="RGBA")
    else:
        image = Image.fromarray(np.ascontiguousarray(arr[:, :, ::-1]), mode="RGB")
    image.save(dest, format="PNG")


def enhance(img, scale: int):
    """Upscale one BGR frame. The returned array is still BGR."""
    with _lock:
        try:
            upsampler = get_upsampler()
        except Exception:
            raise HTTPException(500, "Could not load the Real-ESRGAN model") from None
        try:
            output, _mode = upsampler.enhance(img, outscale=scale)
        except Exception:
            raise HTTPException(500, "Upscaling failed") from None
    return output


def video_meta(path: str):
    """Return (duration, fps, has_audio) for a video file."""
    cmd = [
        "ffprobe", "-v", "quiet", "-print_format", "json",
        "-show_format", "-show_streams", path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise HTTPException(400, "Send an image or a video")
    info = json.loads(result.stdout)
    streams = info.get("streams", [])
    video = next((s for s in streams if s.get("codec_type") == "video"), None)
    if video is None:
        raise HTTPException(400, "Send an image or a video")
    rate = video.get("avg_frame_rate") or video.get("r_frame_rate") or "0/1"
    num, _, den = rate.partition("/")
    try:
        den_f = float(den or 1)
        fps = float(num) / den_f if den_f else 0
    except ValueError:
        fps = 0
    if fps <= 0:
        fps = 30.0
    duration = float(info.get("format", {}).get("duration") or video.get("duration") or 0)
    has_audio = any(s.get("codec_type") == "audio" for s in streams)
    return duration, fps, has_audio


def upscale_video(src: str, tmp: str, scale: int) -> str:
    """Extract frames, upscale each one, and mux the result back with the audio."""
    duration, fps, has_audio = video_meta(src)
    if duration > MAX_SECONDS:
        raise HTTPException(400, f"video must be at most {MAX_SECONDS:.0f} seconds")

    frames = os.path.join(tmp, "frames")
    os.makedirs(frames)
    extracted = subprocess.run(
        ["ffmpeg", "-y", "-i", src, os.path.join(frames, "%06d.png")],
        capture_output=True,
    )
    if extracted.returncode != 0:
        raise HTTPException(400, "Could not read frames from this video")
    names = sorted(name for name in os.listdir(frames) if name.endswith(".png"))
    if not names:
        raise HTTPException(400, "This video has no frames")
    if len(names) > MAX_FRAMES:
        raise HTTPException(400, f"video must be at most {MAX_FRAMES} frames")

    up_dir = os.path.join(tmp, "up")
    os.makedirs(up_dir)
    for name in names:
        frame = load_image(os.path.join(frames, name))
        save_png(enhance(frame, scale), os.path.join(up_dir, name))

    out = os.path.join(tmp, "upscaled.mp4")
    # yuv420p needs even dimensions; scale 3 can leave an odd side.
    cmd = [
        "ffmpeg", "-y", "-framerate", f"{fps:.4f}", "-start_number", "1",
        "-i", os.path.join(up_dir, "%06d.png"),
    ]
    if has_audio:
        cmd += ["-i", src, "-map", "0:v:0", "-map", "1:a:0", "-c:a", "aac", "-b:a", "192k", "-shortest"]
    cmd += [
        "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart", out,
    ]
    merged = subprocess.run(cmd, capture_output=True)
    if merged.returncode != 0:
        raise HTTPException(500, "Could not reassemble the upscaled video")
    return out


def _export(background: BackgroundTasks, file: UploadFile, scale: int):
    if not 2 <= scale <= 4:
        raise HTTPException(400, "scale must be between 2 and 4")
    tmp = tempfile.mkdtemp()
    try:
        src = os.path.join(tmp, "input")
        save_upload(file, src)
        if is_still_image(src):
            out = os.path.join(tmp, "upscaled.png")
            save_png(enhance(load_image(src), scale), out)
            media_type, filename = "image/png", "upscaled.png"
        else:
            out = upscale_video(src, tmp, scale)
            media_type, filename = "video/mp4", "upscaled.mp4"
        background.add_task(shutil.rmtree, tmp, True)
        return FileResponse(out, media_type=media_type, filename=filename)
    except Exception:
        shutil.rmtree(tmp, ignore_errors=True)
        raise


@router.post("/upscale")
def upscale(
    background: BackgroundTasks,
    file: UploadFile = File(...),
    scale: int = Form(2),
    x_api_key: Optional[str] = Header(None),
):
    """Upscale an image or a short video and return the larger file."""
    check_auth(x_api_key)
    return _export(background, file, scale)
