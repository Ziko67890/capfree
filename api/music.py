"""Royalty-free music search, proxied through the API.

Openverse (openverse.org, run by WordPress) aggregates Jamendo, ccMixter and
Freesound behind one search API and reports each track's licence, so the panel
can tell the user what they are allowed to do. No key is required, though
OPENVERSE_CLIENT_ID / OPENVERSE_CLIENT_SECRET raise the rate limit if set.

Freesound stands in when Openverse is unreachable, which it regularly is. Its
default search returns NonCommercial material, so FREESOUND_FILTER pins it to
the same licence footing as the Openverse query.

Two things this module deliberately does not do:

  * It does not ask for every commercially usable licence. Openverse's
    `license_type=commercial` keeps NoDerivatives tracks, and dropping a song
    into a video timeline is a derivative use, so the LICENCES list below names
    the four slugs that allow both commercial use and adaptation.
  * It does not fetch whatever URL the browser asks for. /music/download takes a
    URL from the search results, so it is attacker-controlled as far as this
    process is concerned; ALLOWED_HOSTS is checked on the request and on every
    redirect hop to keep it from being used to probe the network it runs in.
"""

import os
import re
import time
from typing import Optional
from urllib.parse import urljoin, urlparse

import requests
from fastapi import APIRouter, Header, HTTPException, Query
from fastapi.responses import Response

from silence import check_auth

router = APIRouter()

SEARCH_URL = "https://api.openverse.org/v1/audio/"
TOKEN_URL = "https://api.openverse.org/v1/auth_tokens/token/"
USER_AGENT = "CapFree/1.0"

# Commercial use allowed AND adaptation allowed. Keeping NC and ND out of the
# query is what lets the panel claim the results are safe to publish.
LICENCES = "cc0,pdm,by,by-sa"

# Where Openverse's audio actually lives. Checked per redirect hop.
ALLOWED_HOSTS = (
    "jamendo.com",
    "freesound.org",
    "ccmixter.org",
    "wikimedia.org",
)

MAX_MUSIC_MB = int(os.getenv("MAX_MUSIC_MB", "40"))

# Openverse's failure mode is a refused or hung connection rather than a slow
# reply, so the connect half is what needed the room. The read half stays long:
# a cold search there genuinely takes 20s+, and cutting it to 15 would turn
# working searches into timeouts.
TIMEOUT = (15, 45)  # connect, read
ATTEMPTS = 3
RETRY_DELAY = 2.0

FREESOUND_URL = "https://freesound.org/apiv2/search/text/"
# Freesound's own names for CC0 and the two CC-BY versions. Without this the
# results are full of NonCommercial sounds the panel must not offer.
FREESOUND_FILTER = 'license:("Creative Commons 0" OR "Attribution" OR "Attribution 4.0")'
FREESOUND_FIELDS = "id,name,duration,previews,license,username,tags"

# Public-domain marks carry no conditions; the CC licences all require credit.
NO_ATTRIBUTION = ("cc0", "pdm")

LICENCE_LABELS = {
    "cc0": "CC0 1.0",
    "pdm": "Public domain",
    "by": "CC BY",
    "by-sa": "CC BY-SA",
}

_BPM = re.compile(r"\b(\d{2,3})\s*bpm\b", re.IGNORECASE)

_token = {"value": None, "expires": 0.0}


def _bearer() -> Optional[str]:
    """Client-credentials token, cached until it expires. None when unconfigured."""
    client_id = os.getenv("OPENVERSE_CLIENT_ID")
    secret = os.getenv("OPENVERSE_CLIENT_SECRET")
    if not client_id or not secret:
        return None
    if _token["value"] and time.time() < _token["expires"]:
        return _token["value"]
    try:
        response = requests.post(
            TOKEN_URL,
            data={
                "grant_type": "client_credentials",
                "client_id": client_id,
                "client_secret": secret,
            },
            timeout=TIMEOUT,
            headers={"User-Agent": USER_AGENT},
        )
        if response.status_code != 200:
            return None
        payload = response.json()
        _token["value"] = payload.get("access_token")
        _token["expires"] = time.time() + max(0, int(payload.get("expires_in", 0))) - 60
        return _token["value"]
    except Exception:
        # An unavailable token endpoint should degrade to anonymous, not 500.
        return None


def _headers() -> dict:
    headers = {"User-Agent": USER_AGENT}
    token = _bearer()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def _get(url: str, params: Optional[dict] = None, headers: Optional[dict] = None):
    """Openverse drops connections fairly often; one timeout is not an outage."""
    last = None
    for attempt in range(ATTEMPTS):
        try:
            response = requests.get(
                url, params=params, timeout=TIMEOUT, headers=headers or _headers()
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
    raise HTTPException(503, f"Music search is unavailable right now: {last}")


def _bpm(track: dict) -> Optional[int]:
    """Neither Openverse nor Jamendo expose BPM, but taggers often write it down."""
    haystack = [tag.get("name", "") for tag in (track.get("tags") or [])]
    haystack += list(track.get("genres") or [])
    haystack.append(track.get("title") or "")
    for text in haystack:
        found = _BPM.search(str(text))
        if found:
            value = int(found.group(1))
            if 40 <= value <= 240:
                return value
    return None


def _host_allowed(host: str) -> bool:
    host = (host or "").lower().split(":")[0]
    return any(host == domain or host.endswith("." + domain) for domain in ALLOWED_HOSTS)


def _shape(track: dict) -> dict:
    licence = (track.get("license") or "").lower()
    version = track.get("license_version") or ""
    label = LICENCE_LABELS.get(licence, licence.upper() or "Unknown")
    if version and licence not in NO_ATTRIBUTION:
        label = f"{label} {version}"
    ms = track.get("duration") or 0
    return {
        "id": track.get("id"),
        "title": (track.get("title") or "Untitled").strip(),
        "artist": (track.get("creator") or "Unknown artist").strip(),
        "artist_url": track.get("creator_url"),
        "album": (track.get("audio_set") or {}).get("title"),
        "duration": round(ms / 1000, 2) if ms else 0,
        "bpm": _bpm(track),
        "genres": [str(g) for g in (track.get("genres") or [])][:3],
        "license": licence,
        "license_label": label,
        "license_url": track.get("license_url"),
        "requires_attribution": licence not in NO_ATTRIBUTION,
        "attribution": track.get("attribution") or "",
        "provider": track.get("provider") or track.get("source") or "",
        "source_url": track.get("foreign_landing_url"),
        "preview_url": track.get("url"),
    }


FREESOUND_LICENCES = (
    ("publicdomain/zero", "cc0", "CC0 1.0", False),
    ("licenses/by/4.0", "by", "CC BY 4.0", True),
    ("licenses/by/3.0", "by", "CC BY 3.0", True),
    ("licenses/by/", "by", "CC BY", True),
)


def _shape_freesound(sound: dict) -> Optional[dict]:
    """Freesound's rows, mapped onto the same contract as the Openverse ones."""
    previews = sound.get("previews") or {}
    # The full original needs OAuth2; the HQ mp3 preview is the whole sound and
    # only needs the token, so it is what gets previewed and imported.
    url = previews.get("preview-hq-mp3") or previews.get("preview-lq-mp3")
    if not url or not _host_allowed(urlparse(url).hostname or ""):
        return None

    raw_licence = str(sound.get("license") or "")
    slug, label, credit = "by", "CC BY", True
    for needle, found_slug, found_label, needs_credit in FREESOUND_LICENCES:
        if needle in raw_licence:
            slug, label, credit = found_slug, found_label, needs_credit
            break

    sound_id = sound.get("id")
    title = (sound.get("name") or "Untitled").strip()
    artist = (sound.get("username") or "Unknown artist").strip()
    source_url = f"https://freesound.org/s/{sound_id}/" if sound_id else None
    attribution = f'"{title}" by {artist} - {label}'
    if credit and source_url:
        attribution = f"{attribution} ({source_url})"

    return {
        "id": f"fs-{sound_id}",
        "title": title,
        "artist": artist,
        "artist_url": f"https://freesound.org/people/{artist}/" if artist else None,
        "album": None,
        "duration": round(float(sound.get("duration") or 0), 2),
        "bpm": _bpm({"title": title, "tags": [{"name": t} for t in (sound.get("tags") or [])]}),
        "genres": [str(t) for t in (sound.get("tags") or [])][:3],
        "license": slug,
        "license_label": label,
        "license_url": raw_licence or None,
        "requires_attribution": credit,
        "attribution": attribution,
        "provider": "freesound",
        "source_url": source_url,
        "preview_url": url,
    }


def _freesound_search(q: str, page: int, page_size: int) -> dict:
    """Backup search. Raises 503 when it is unconfigured or also unreachable."""
    token = os.getenv("FREESOUND_API_KEY")
    if not token:
        raise HTTPException(503, "FREESOUND_API_KEY is not configured on the server")

    response = _get(
        FREESOUND_URL,
        {
            "query": q.strip() or "music",
            "filter": FREESOUND_FILTER,
            "fields": FREESOUND_FIELDS,
            "page": page,
            "page_size": page_size,
            "token": token,
        },
        headers={"User-Agent": USER_AGENT},
    )
    if response.status_code in (401, 403):
        raise HTTPException(502, "Freesound rejected the configured API key")
    if response.status_code == 429:
        raise HTTPException(429, "Music search is rate limited - try again shortly")
    if response.status_code != 200:
        raise HTTPException(502, f"Freesound search failed ({response.status_code})")

    try:
        payload = response.json()
    except ValueError:
        raise HTTPException(502, "Freesound returned an unreadable response")

    tracks = [
        shaped
        for shaped in (_shape_freesound(item) for item in payload.get("results") or [])
        if shaped
    ]
    total = int(payload.get("count") or len(tracks))
    return {
        "query": q.strip(),
        "source": "freesound",
        "page": page,
        "page_count": -(-total // page_size) if page_size else 0,
        "count": total,
        "tracks": tracks,
    }


def _openverse_search(q: str, page: int, page_size: int) -> dict:
    params = {
        "page": page,
        "page_size": page_size,
        "license": LICENCES,
        "category": "music",
        # Openverse needs something to match on; this stands in for "browse".
        "q": q.strip() or "music",
    }
    response = _get(SEARCH_URL, params)
    if response.status_code == 401:
        raise HTTPException(502, "Openverse rejected the configured credentials")
    if response.status_code == 429:
        raise HTTPException(429, "Music search is rate limited - try again shortly")
    if response.status_code != 200:
        raise HTTPException(502, f"Music search failed ({response.status_code})")

    try:
        payload = response.json()
    except ValueError:
        raise HTTPException(502, "Music search returned an unreadable response")

    tracks = [
        shaped
        for shaped in (_shape(item) for item in payload.get("results") or [])
        # A row with no playable URL cannot be previewed or added, so drop it.
        if shaped["preview_url"]
        and _host_allowed(urlparse(shaped["preview_url"]).hostname or "")
    ]
    return {
        "query": q.strip(),
        "source": "openverse",
        "page": payload.get("page", page),
        "page_count": payload.get("page_count", 0),
        "count": payload.get("result_count", len(tracks)),
        "tracks": tracks,
    }


@router.get("/music/search")
def music_search(
    q: str = Query("", max_length=120),
    page: int = Query(1, ge=1, le=20),
    page_size: int = Query(20, ge=1, le=50),
    x_api_key: Optional[str] = Header(None),
):
    """Search royalty-free music. Only results usable commercially are returned."""
    check_auth(x_api_key)
    try:
        return _openverse_search(q, page, page_size)
    except HTTPException as exc:
        # Only an unreachable Openverse is worth a second provider; a 429 or a
        # rejected key would fail the same way twice.
        if exc.status_code != 503:
            raise
        try:
            return _freesound_search(q, page, page_size)
        except HTTPException as backup:
            if backup.status_code == 503:
                raise HTTPException(
                    503,
                    "Music search is unavailable: Openverse could not be reached "
                    f"and the Freesound fallback failed ({backup.detail})",
                )
            raise


@router.get("/music/download")
def music_download(
    url: str = Query(..., max_length=2000),
    x_api_key: Optional[str] = Header(None),
):
    """Fetch one track's bytes so the browser is not blocked by the host's CORS."""
    check_auth(x_api_key)

    target = url
    for _hop in range(5):
        parsed = urlparse(target)
        if parsed.scheme != "https":
            raise HTTPException(400, "Only https track URLs are allowed")
        if not _host_allowed(parsed.hostname or ""):
            raise HTTPException(400, f"{parsed.hostname} is not a known royalty-free music host")
        try:
            response = requests.get(
                target,
                timeout=TIMEOUT,
                headers={"User-Agent": USER_AGENT},
                stream=True,
                allow_redirects=False,
            )
        except requests.RequestException as exc:
            raise HTTPException(503, f"Could not reach the music host ({exc.__class__.__name__})")

        if response.status_code in (301, 302, 303, 307, 308):
            location = response.headers.get("location")
            response.close()
            if not location:
                raise HTTPException(502, "The music host redirected without a target")
            # Re-checked at the top of the loop, so a redirect cannot leave the allowlist.
            target = urljoin(target, location)
            continue

        if response.status_code != 200:
            response.close()
            raise HTTPException(502, f"The music host returned {response.status_code}")

        limit = MAX_MUSIC_MB * 1024 * 1024
        declared = response.headers.get("content-length")
        if declared and declared.isdigit() and int(declared) > limit:
            response.close()
            raise HTTPException(413, f"That track is larger than {MAX_MUSIC_MB} MB")

        media_type = (response.headers.get("content-type") or "audio/mpeg").split(";")[0]
        chunks, size = [], 0
        try:
            for chunk in response.iter_content(64 * 1024):
                size += len(chunk)
                if size > limit:
                    raise HTTPException(413, f"That track is larger than {MAX_MUSIC_MB} MB")
                chunks.append(chunk)
        finally:
            response.close()

        if size == 0:
            raise HTTPException(502, "The music host returned an empty file")
        if not media_type.startswith("audio/"):
            media_type = "audio/mpeg"

        return Response(
            content=b"".join(chunks),
            media_type=media_type,
            headers={"Cache-Control": "private, max-age=3600"},
        )

    raise HTTPException(502, "The music host redirected too many times")
