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

# What one operation adds to the reported cost, unless its rule names a figure
# of its own. No model runs here, so this is the size of the exchange rather
# than a bill -- reported in the same unit as the model-backed prompt bar so
# the two can be added up in one place later.
DEFAULT_OP_TOKENS = 20


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
        # Deliberately wide: an outro is asked for in more ways than anything
        # else here, and most of the phrasings are the outro's own script
        # ("smash the like", "see you next time") rather than a description of
        # the edit. Matching on whole words keeps the loosest of them --
        # "thanks", "follow", "share this" -- from firing inside other words.
        "name": "add_outro",
        "words": [
            "thanks", "outro", "thanks for watching", "follow", "subscribe",
            "end card", "end screen", "see you next", "see you in the next",
            "that's all", "thats all", "wrap up", "wrap it up", "till next time",
            "until next time", "smash the like", "hit the like", "drop a like",
            "comment below", "share this", "don't forget to", "if you enjoyed",
            "peace out", "that's a wrap", "thats a wrap", "catch you later",
            "stay tuned", "notification bell", "turn on notifications",
            "new video every", "upload every",
        ],
        "operation": {
            "op": "add_outro",
            "text1": "Thanks for Watching! 🙏",
            "text2": "Like & Subscribe for more",
            "duration": 3,
        },
        "phrase": "a three-second end card after the last clip",
        # The card is drawn in the browser from fixed strings, so this one
        # really is the cheapest thing the endpoint can ask for.
        "tokens": 1,
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
    # Most operations cost the same; a rule may say otherwise.
    costs: List[int] = []
    suppressed: set = set()

    for rule in RULES:
        if rule["name"] in suppressed:
            continue
        if not matches(prompt, rule["words"]):
            continue
        suppressed.update(rule.get("suppresses", []))
        operations.append(dict(rule["operation"]))
        phrases.append(rule["phrase"])
        costs.append(int(rule.get("tokens", DEFAULT_OP_TOKENS)))

    # An audio-only selection has no picture: a grade, a zoom or a hook over it
    # would be an operation the editor could not carry out. Dropping them here
    # keeps the browser from having to second-guess the answer.
    if request.clip_type == "audio":
        visual = {"add_text", "add_outro", "color_grade", "zoom_pan"}
        kept = [
            (op, phrase, cost)
            for op, phrase, cost in zip(operations, phrases, costs)
            if op["op"] not in visual
        ]
        dropped = len(operations) - len(kept)
        operations = [op for op, _, _ in kept]
        phrases = [phrase for _, phrase, _ in kept]
        costs = [cost for _, _, cost in kept]
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

    # The prompt itself, plus whatever each matched rule charges.
    cost_tokens = len(prompt) // 4 + sum(costs)

    return {
        "operations": operations,
        "description": describe(phrases),
        "cost_tokens": cost_tokens,
    }
