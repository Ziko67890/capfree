"""Object tracking with OpenCV (CSRT, KCF, MOSSE)."""

import os
import tempfile
from typing import Optional

from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile

from silence import check_auth, probe, save_upload

router = APIRouter()

TRACKERS = ("csrt", "kcf", "mosse")


def create_tracker(name: str):
    """Build an OpenCV tracker. Recent builds use .create(); older ones use a factory."""
    import cv2

    class_name = {"csrt": "TrackerCSRT", "kcf": "TrackerKCF", "mosse": "TrackerMOSSE"}[name]
    # MOSSE only remains under cv2.legacy. CSRT and KCF are on cv2 when contrib is installed.
    modules = []
    legacy = getattr(cv2, "legacy", None)
    if name == "mosse":
        modules = [legacy, cv2]
    else:
        modules = [cv2, legacy]
    for module in modules:
        if module is None:
            continue
        klass = getattr(module, class_name, None)
        if klass is not None and hasattr(klass, "create"):
            return klass.create()
        creator = getattr(module, f"{class_name}_create", None)
        if creator is not None:
            return creator()
    raise HTTPException(500, "This OpenCV build has no tracking module")


def _box(frame: int, x, y, width, height, found: bool) -> dict:
    return {
        "frame": frame,
        "x": int(round(float(x))),
        "y": int(round(float(y))),
        "width": max(0, int(round(float(width)))),
        "height": max(0, int(round(float(height)))),
        "found": bool(found),
    }


def track_object(path: str, tracker_name: str, x: int, y: int, width: int, height: int) -> list:
    """Follow the initial box through every frame. Frame 0 is the box the caller sent."""
    import cv2

    if width <= 0 or height <= 0:
        raise HTTPException(400, "width and height must be positive")
    if x < 0 or y < 0:
        raise HTTPException(400, "x and y must be zero or positive")

    cap = cv2.VideoCapture(path)
    try:
        ok, frame = cap.read()
        if not ok or frame is None:
            raise HTTPException(400, "Could not read frames from this video")
        frame_h, frame_w = frame.shape[:2]
        if x + width > frame_w or y + height > frame_h:
            raise HTTPException(400, "bounding box is outside the first frame")

        tracker = create_tracker(tracker_name)
        bbox = (x, y, width, height)
        try:
            started = tracker.init(frame, bbox)
        except cv2.error:
            raise HTTPException(400, "Could not start tracking from that bounding box") from None
        if started is False:
            raise HTTPException(400, "Could not start tracking from that bounding box")

        boxes = [_box(0, x, y, width, height, True)]
        index = 1
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            try:
                found, box = tracker.update(frame)
            except cv2.error:
                found, box = False, (0, 0, 0, 0)
            boxes.append(_box(index, box[0], box[1], box[2], box[3], found))
            index += 1
        return boxes
    finally:
        cap.release()


@router.post("/track")
def track(
    file: UploadFile = File(...),
    tracker: str = Form("csrt"),
    x: int = Form(...),
    y: int = Form(...),
    width: int = Form(...),
    height: int = Form(...),
    x_api_key: Optional[str] = Header(None),
):
    """Track one object through a video and return a bounding box per frame."""
    check_auth(x_api_key)
    tracker = tracker.strip().lower()
    if tracker not in TRACKERS:
        raise HTTPException(400, "tracker must be csrt, kcf, or mosse")

    with tempfile.TemporaryDirectory() as tmp:
        src = os.path.join(tmp, "input")
        save_upload(file, src)
        _duration, has_video, _has_audio = probe(src)
        if not has_video:
            raise HTTPException(400, "Send a video file")
        return track_object(src, tracker, x, y, width, height)
