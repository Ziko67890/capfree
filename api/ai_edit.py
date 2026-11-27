"""Turning a sentence about an edit into a list of operations.

This is keyword matching, not a model. That is a deliberate choice for this
endpoint: the vocabulary of a video editor is small and the mapping from
"add a hook" to an operation is not the interesting part of the problem, so
spending a model call -- and a round trip, and a key -- on it buys nothing.
The editor's other prompt bar (/ai/prompt) is the one that calls a model, for
the open-ended asks this cannot answer.

What this does have to be is predictable. Every rule is listed in one table,
in priority order, and a prompt that matches nothing comes back saying so
rather than guessing. The operations it returns are descriptions of intent:
the browser owns the timeline and does the actual work, because that is where
the media is.
"""

import os
import re
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

router = APIRouter()


class AiEditRequest(BaseModel):
    prompt: str = Field(default="", max_length=2000)
    clip_type: str = Field(default="video", max_length=40)
    clip_duration: float = Field(default=0.0, ge=0, le=86400)
    timeline_state: Dict[str, Any] = Field(default_factory=dict)


def check_auth(x_api_key: Optional[str]):
    api_key = os.getenv("API_KEY")
    if api_key and x_api_key != api_key:
        raise HTTPException(401, "Invalid API key")


# Each rule is (name, trigger words, the operation, how to describe it).
#
# Order is priority, and it matters in two places. "quiet music" contains
# "music", so ducking has to be tried before adding a track or the editor
# would be handed a new song instead of a quieter one. "speed ramp" contains
# neither of the other two, but "fast" is loose enough that it sits last.
#
# A phrase matches on a word boundary, so "silence" does not fire on
# "silences" being part of a longer word, and "pan" does not fire inside
# "panel" or "company".
RULES: List[Dict[str, Any]] = [
    {
        "name": "add_text",
        "words": ["hook", "hook text", "opening text", "intro text", "title card"],
        "operation": {
            "op": "add_text",
            "text": "Watch This First 👀",
            "start": 0,
            "end": 3,
            "position": "top",
            "style": "hook",
        },
        "phrase": "a hook title over the first three seconds",
    },
    {
        "name": "add_captions",
        "words": ["caption", "captions", "subtitle", "subtitles", "subs"],
        "operation": {"op": "add_captions", "source": "auto", "segments": []},
        "phrase": "auto-captions from the clip's own audio",
    },
    {
        "name": "trim_silences",
        "words": ["silence", "silences", "remove silence", "dead air", "gaps"],
        "operation": {"op": "trim_silences", "threshold_db": -40},
        "phrase": "the silent stretches marked up",
    },
    {
        # Before add_music: "quiet music" and "lower the music" name this one.
        "name": "audio_duck",
        "words": ["duck", "ducking", "lower music", "quiet music", "quieter music", "under the voice"],
        "operation": {"op": "audio_duck", "voice_ratio": 0.2},
        "phrase": "the music ducked under the voice",
        "suppresses": ["add_music"],
    },
    {
        "name": "add_music",
        "words": ["music", "background music", "chill music", "soundtrack", "song"],
        "operation": {"op": "add_music", "genre": "chill", "volume": 0.3},
        "phrase": "a chill backing track",
    },
    {
        "name": "color_grade",
        "words": ["color", "colour", "cinematic", "grade", "grading", "look"],
        "operation": {"op": "color_grade", "preset": "cinematic"},
        "phrase": "a cinematic grade on the preview",
    },
    {
        "name": "speed_ramp",
        "words": ["speed", "ramp", "faster", "fast", "speed up"],
        "operation": {
            "op": "speed_ramp",
            "start_speed": 1.0,
            "end_speed": 2.0,
            "at": "end",
        },
        "phrase": "the clip sped up to 2x",
    },
    {
        "name": "zoom_pan",
        "words": ["zoom", "ken burns", "pan", "push in"],
        "operation": {"op": "zoom_pan", "style": "ken_burns"},
        "phrase": "a slow Ken Burns push on the preview",
    },
]

FALLBACK = (
    "I didn't understand that. Try: add hook text, remove silences, auto captions."
)


def matches(prompt: str, words: List[str]) -> bool:
    """True when any of `words` appears in `prompt` as a whole word or phrase.

    Word boundaries rather than `in`, so "pan" does not fire on "panel" and
    "song" does not fire on "songwriter". The phrases with spaces in them work
    the same way; the boundary just lands at each end of the phrase.
    """
    for word in words:
        if re.search(rf"(?<!\w){re.escape(word)}(?!\w)", prompt):
            return True
    return False


def describe(phrases: List[str]) -> str:
    """One sentence naming what is about to be applied."""
    count = len(phrases)
    if count == 1:
        body = phrases[0]
    elif count == 2:
        body = f"{phrases[0]} and {phrases[1]}"
    else:
        body = f"{', '.join(phrases[:-1])} and {phrases[-1]}"
    return f"Applying {count} edit{'' if count == 1 else 's'}: {body}."


@router.post("/ai-edit")
def ai_edit(request: AiEditRequest, x_api_key: Optional[str] = Header(None)):
    """Read an edit request in plain words and name the operations it means.

    `clip_type`, `clip_duration` and `timeline_state` describe what is selected
    so the operations can be fitted to it -- a hook over a clip shorter than
    three seconds is clipped to the clip, and an audio-only selection has no
    picture to grade or zoom.
    """
    check_auth(x_api_key)

    prompt = request.prompt.lower().strip()
    if not prompt:
        return {"operations": [], "description": FALLBACK, "cost_tokens": 0}

    operations: List[Dict[str, Any]] = []
    phrases: List[str] = []
    suppressed: set = set()

    for rule in RULES:
        if rule["name"] in suppressed:
            continue
        if not matches(prompt, rule["words"]):
            continue
        suppressed.update(rule.get("suppresses", []))
        operations.append(dict(rule["operation"]))
        phrases.append(rule["phrase"])

    # An audio-only selection has no picture: a grade, a zoom or a hook over it
    # would be an operation the editor could not carry out. Dropping them here
    # keeps the browser from having to second-guess the answer.
    if request.clip_type == "audio":
        visual = {"add_text", "color_grade", "zoom_pan"}
        kept = [
            (op, phrase)
            for op, phrase in zip(operations, phrases)
            if op["op"] not in visual
        ]
        dropped = len(operations) - len(kept)
        operations = [op for op, _ in kept]
        phrases = [phrase for _, phrase in kept]
        if dropped and not operations:
            return {
                "operations": [],
                "description": "That only applies to picture, and an audio clip is selected.",
                "cost_tokens": 0,
            }

    # A hook that outlasts the clip is a hook hanging over the end of it. The
    # phrase is rewritten from the clamped values rather than left at the
    # rule's wording, so the sentence cannot promise three seconds of title
    # over a clip that is shorter than that.
    if request.clip_duration > 0:
        for index, op in enumerate(operations):
            if op["op"] == "add_text" and op["end"] > request.clip_duration:
                op["end"] = round(max(0.5, request.clip_duration), 2)
                length = op["end"] - op["start"]
                phrases[index] = f"a hook title over the first {length:g} seconds"

    if not operations:
        return {"operations": [], "description": FALLBACK, "cost_tokens": 0}

    # No model ran, so this is not a bill -- it is the size of the exchange, in
    # the same unit the model-backed prompt bar reports, so the two can be
    # added up in one place later.
    cost_tokens = len(prompt) // 4 + 20 * len(operations)

    return {
        "operations": operations,
        "description": describe(phrases),
        "cost_tokens": cost_tokens,
    }
