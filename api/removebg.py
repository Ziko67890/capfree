import io
import os
import tempfile
from typing import Optional

from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import Response

from silence import check_auth, save_upload

router = APIRouter()

MODELS = ("u2netp", "isnet-general-use")


def remove_background(image_bytes: bytes, model_name: str = "u2netp") -> bytes:
    """Run rembg on raw image bytes, return PNG with transparent background."""
    from rembg import new_session, remove

    session = new_session(model_name)
    return remove(image_bytes, session=session)


@router.post("/removebg")
def removebg(
    file: UploadFile = File(...),
    model: str = Form("u2netp"),
    x_api_key: Optional[str] = Header(None),
):
    """Remove the background from an image. Returns a PNG with transparency."""
    check_auth(x_api_key)
    if model not in MODELS:
        raise HTTPException(400, f"model must be one of: {', '.join(MODELS)}")

    data = file.file.read()
    max_mb = int(os.getenv("MAX_UPLOAD_MB", "200"))
    if len(data) > max_mb * 1024 * 1024:
        raise HTTPException(413, f"File too large (max {max_mb} MB)")

    try:
        result = remove_background(data, model)
    except Exception as e:
        raise HTTPException(422, f"Could not process this image: {e}")

    return Response(
        content=result,
        media_type="image/png",
        headers={"Content-Disposition": "attachment; filename=nobg.png"},
    )


@router.post("/removebg/batch")
def removebg_batch(
    files: list[UploadFile] = File(...),
    model: str = Form("u2netp"),
    x_api_key: Optional[str] = Header(None),
):
    """Remove backgrounds from multiple images. Returns a JSON array of base64 PNGs."""
    import base64

    check_auth(x_api_key)
    if model not in MODELS:
        raise HTTPException(400, f"model must be one of: {', '.join(MODELS)}")
    if len(files) > 10:
        raise HTTPException(400, "Maximum 10 images per batch")

    results = []
    for f in files:
        data = f.file.read()
        try:
            out = remove_background(data, model)
            results.append({
                "filename": f.filename,
                "png_base64": base64.b64encode(out).decode(),
            })
        except Exception as e:
            results.append({
                "filename": f.filename,
                "error": str(e),
            })

    return {"results": results}
