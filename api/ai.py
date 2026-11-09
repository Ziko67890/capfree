"""Natural-language editing prompts, resolved server-side.

The key lives here rather than in the browser, so the model call is behind a
free-tier limit the client cannot talk its way past.

Intent comes back as a function call rather than prose: the model either names
one of the three editor actions with typed arguments or it does not, so there is
nothing to parse out of a sentence and a chatty answer can never be mistaken
for a command.
"""

import json
import os
import threading
import time
from datetime import datetime, timezone
from typing import Optional

import requests
from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, Field

from silence import check_auth

router = APIRouter()

OPENAI_URL = "https://api.openai.com/v1/chat/completions"
MODEL = "gpt-4o-mini"

TIMEOUT = (15, 45)  # connect, read
ATTEMPTS = 3
RETRY_DELAY = 2.0

# Free tier. In memory by design: a restart forgives everyone, which is the
# right failure mode for a soft limit on a free feature.
DAILY_LIMIT = int(os.getenv("AI_DAILY_LIMIT", "5"))
# Derived rather than literal so the sentence cannot contradict the limit; at
# the default of 5 it reads exactly as specified.
LIMIT_MESSAGE = (
    f"You've used your {DAILY_LIMIT} free AI edits for today. Come back tomorrow."
)

# ip -> (UTC date, count). Guarded because sync endpoints run in a threadpool.
_hits: dict = {}
_hits_lock = threading.Lock()

FUNCTIONS = [
    {
        "type": "function",
        "function": {
            "name": "remove_silences",
            "description": (
                "Detect and cut the silent stretches out of the video on the timeline. "
                "Use for 'remove all silences', 'cut the pauses', 'tighten this up'."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "add_music",
            "description": (
                "Search the royalty-free music library for a mood or genre and add the "
                "best match to the timeline at the playhead."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "mood": {
                        "type": "string",
                        "description": (
                            "The mood, genre or feel as a short search phrase: "
                            "'chill', 'upbeat', 'hip hop', 'cinematic'."
                        ),
                    }
                },
                "required": ["mood"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "trim_to_duration",
            "description": (
                "Shorten the whole timeline to a given length, keeping the beginning. "
                "Use for 'make it 30 seconds', 'cut it down to a minute'."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "seconds": {
                        "type": "number",
                        "description": "Target length in seconds. Convert minutes first.",
                    }
                },
                "required": ["seconds"],
            },
        },
    },
]


class PromptBody(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=2000)
    duration: float = Field(0, ge=0)
    clip_count: int = Field(0, ge=0)


def _key() -> str:
    # An empty value in .env is as unconfigured as an absent one.
    key = (os.getenv("OPENAI_API_KEY") or "").strip()
    if not key:
        raise HTTPException(503, "OPENAI_API_KEY is not configured on the server")
    return key


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _client_ip(request: Request) -> str:
    """First hop of X-Forwarded-For when proxied, else the socket address.

    The header is caller-supplied and therefore spoofable; that is acceptable
    for a free-tier limit and would not be for anything protecting data.
    """
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        first = forwarded.split(",")[0].strip()
        if first:
            return first
    return request.client.host if request.client else "unknown"


def _remaining(ip: str) -> int:
    with _hits_lock:
        day, count = _hits.get(ip, (_today(), 0))
        if day != _today():
            count = 0
        return max(0, DAILY_LIMIT - count)


def _check_quota(ip: str) -> None:
    if _remaining(ip) <= 0:
        raise HTTPException(429, LIMIT_MESSAGE)


def _spend(ip: str) -> int:
    """Counts one use and returns what is left. Called only after the model answers."""
    with _hits_lock:
        today = _today()
        day, count = _hits.get(ip, (today, 0))
        if day != today:
            count = 0
        count += 1
        _hits[ip] = (today, count)
        return max(0, DAILY_LIMIT - count)


def _system_prompt(duration: float, clip_count: int) -> str:
    # The last line is not in the brief but earns its place: without it
    # gpt-4o-mini answers general questions ("what is the capital of France"
    # came back as "Paris"), which spends one of the caller's five daily edits
    # on trivia and makes the prompt bar look like a chatbot.
    return (
        "You are a video editor assistant. The user has a video timeline "
        f"that is {duration:.1f} seconds long with {clip_count} clips. "
        "Call the appropriate function based on their request. "
        "If nothing fits, reply with a short error message. "
        "Only ever discuss editing this timeline. Never answer general "
        "questions or hold a conversation; for anything off-topic, say in one "
        "sentence that you can only help edit this video."
    )


def _post(key: str, payload: dict):
    """One transient failure upstream is not an outage."""
    last = None
    for attempt in range(ATTEMPTS):
        try:
            response = requests.post(
                OPENAI_URL,
                json=payload,
                timeout=TIMEOUT,
                headers={
                    "Authorization": f"Bearer {key}",
                    "Content-Type": "application/json",
                },
            )
            if response.status_code < 500:
                return response
            last = f"upstream returned {response.status_code}"
        except requests.Timeout:
            last = "upstream timed out"
        except requests.RequestException as exc:
            last = f"upstream unreachable ({exc.__class__.__name__})"
        if attempt + 1 < ATTEMPTS:
            time.sleep(RETRY_DELAY)
    raise HTTPException(503, f"The AI service is unavailable right now: {last}")


def _read_error(response) -> str:
    detail = ""
    try:
        detail = ((response.json() or {}).get("error") or {}).get("message", "").strip()
    except ValueError:
        pass
    if response.status_code in (401, 403):
        return "The server's OpenAI key was rejected"
    if response.status_code == 429:
        # Upstream throttling, not the per-IP free tier.
        return "The AI service is rate limited right now - try again shortly"
    return detail or f"The AI service returned {response.status_code}"


def _shape(message: dict) -> dict:
    """Maps one function call onto the action the editor knows how to run."""
    calls = message.get("tool_calls") or []
    if calls:
        call = (calls[0] or {}).get("function") or {}
        name = call.get("name")
        try:
            args = json.loads(call.get("arguments") or "{}")
        except (ValueError, TypeError):
            args = {}

        if name == "remove_silences":
            return {"action": "remove_silences"}
        if name == "add_music":
            mood = args.get("mood")
            if isinstance(mood, str) and mood.strip():
                return {"action": "add_music", "mood": mood.strip()}
        if name == "trim_to_duration":
            try:
                seconds = float(args.get("seconds"))
            except (TypeError, ValueError):
                seconds = 0.0
            if seconds > 0:
                return {"action": "trim_to_duration", "seconds": seconds}

    said = (message.get("content") or "").strip()
    return {"action": "reply", "text": said or "I could not work out what to change."}


@router.post("/ai/prompt")
def ai_prompt(
    body: PromptBody,
    request: Request,
    x_api_key: Optional[str] = Header(None),
):
    """Turn a sentence into one editor action. Five a day per caller."""
    check_auth(x_api_key)
    key = _key()

    ip = _client_ip(request)
    _check_quota(ip)

    response = _post(
        key,
        {
            "model": MODEL,
            "max_tokens": 256,
            "messages": [
                {"role": "system", "content": _system_prompt(body.duration, body.clip_count)},
                {"role": "user", "content": body.prompt.strip()},
            ],
            "tools": FUNCTIONS,
            "tool_choice": "auto",
        },
    )
    if response.status_code != 200:
        raise HTTPException(502, _read_error(response))

    try:
        payload = response.json()
        message = payload["choices"][0]["message"]
    except (ValueError, KeyError, IndexError):
        raise HTTPException(502, "The AI service returned an unreadable response")

    # Charged only now: a failed call burns no tokens, so it should cost nothing.
    result = _shape(message)
    result["remaining"] = _spend(ip)
    return result
