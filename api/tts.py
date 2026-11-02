"""Text-to-speech via the ElevenLabs API."""

import json
import os
import re
import urllib.error
import urllib.request
import warnings
from typing import Iterator, Optional

# Pydantic treats any field starting with "model_" as reserved. The form field
# is named model_id because that is the ElevenLabs parameter name.
warnings.filterwarnings(
    "ignore",
    message=r'Field "model_id" has conflict with protected namespace "model_"',
)

from fastapi import APIRouter, Form, Header, HTTPException
from fastapi.responses import StreamingResponse

from silence import check_auth

router = APIRouter()

DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"  # Rachel, a public ElevenLabs premade voice
DEFAULT_MODEL_ID = "eleven_monolingual_v1"
MAX_TEXT_CHARS = 5000  # monolingual v1 request limit
_VOICE_ID = re.compile(r"^[A-Za-z0-9]{8,40}$")
_MODEL_ID = re.compile(r"^[A-Za-z0-9_]{1,64}$")


def _validate(text: str, voice_id: str, model_id: str, stability: float, similarity_boost: float) -> str:
    """Reject inputs that ElevenLabs would refuse, before we spend a request."""
    text = text.strip()
    if not text:
        raise HTTPException(400, "text is required")
    if len(text) > MAX_TEXT_CHARS:
        raise HTTPException(400, f"text must be at most {MAX_TEXT_CHARS} characters")
    if not _VOICE_ID.fullmatch(voice_id):
        raise HTTPException(400, "voice_id must be 8-40 letters or digits")
    if not _MODEL_ID.fullmatch(model_id):
        raise HTTPException(400, "model_id contains invalid characters")
    if not 0 <= stability <= 1:
        raise HTTPException(400, "stability must be between 0 and 1")
    if not 0 <= similarity_boost <= 1:
        raise HTTPException(400, "similarity_boost must be between 0 and 1")
    return text


def _elevenlabs_error(status: int, body: str) -> HTTPException:
    snippet = " ".join(body.split())[:240]
    if status == 401:
        return HTTPException(502, "ElevenLabs rejected the API key")
    if status in (400, 422):
        return HTTPException(422, f"ElevenLabs could not synthesize this request: {snippet}")
    return HTTPException(502, f"ElevenLabs request failed ({status})")


def _open_elevenlabs(text: str, voice_id: str, model_id: str, stability: float, similarity_boost: float):
    """POST to the v1 streaming endpoint and return the open HTTP response."""
    api_key = os.getenv("ELEVENLABS_API_KEY")
    if not api_key:
        raise HTTPException(500, "ELEVENLABS_API_KEY is not configured")

    payload = json.dumps({
        "text": text,
        "model_id": model_id,
        "voice_settings": {
            "stability": stability,
            "similarity_boost": similarity_boost,
        },
    }).encode()
    req = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream",
        data=payload,
        headers={
            "xi-api-key": api_key,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg",
        },
        method="POST",
    )
    try:
        return urllib.request.urlopen(req, timeout=120)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        e.close()
        raise _elevenlabs_error(e.code, body) from None
    except urllib.error.URLError:
        raise HTTPException(502, "Could not reach ElevenLabs") from None


def _iter_mp3(resp) -> Iterator[bytes]:
    """Yield MP3 bytes, then close the upstream connection."""
    try:
        while chunk := resp.read(64 * 1024):
            yield chunk
    finally:
        resp.close()


@router.post("/tts")
def tts(
    text: str = Form(...),
    voice_id: str = Form(DEFAULT_VOICE_ID),
    model_id: str = Form(DEFAULT_MODEL_ID),
    stability: float = Form(0.5),
    similarity_boost: float = Form(0.75),
    x_api_key: Optional[str] = Header(None),
):
    """Synthesize speech with ElevenLabs and stream the MP3 back."""
    check_auth(x_api_key)
    text = _validate(text, voice_id, model_id, stability, similarity_boost)
    resp = _open_elevenlabs(text, voice_id, model_id, stability, similarity_boost)

    ctype = resp.headers.get("Content-Type", "")
    if "audio" not in ctype and "octet-stream" not in ctype:
        body = resp.read(2000).decode("utf-8", errors="replace")
        resp.close()
        raise HTTPException(502, f"ElevenLabs returned an unexpected response: {' '.join(body.split())[:240]}")

    return StreamingResponse(
        _iter_mp3(resp),
        media_type="audio/mpeg",
        headers={"Content-Disposition": 'attachment; filename="speech.mp3"'},
    )
