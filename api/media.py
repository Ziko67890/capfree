"""Stock sticker and video search, proxied through the API.

Pixabay's API does cover images and videos (unlike music, which has no API at
all), and everything it returns is usable commercially without credit under the
Pixabay Content License. The key stays here rather than in the bundle, which is
the only reason these are proxies and not direct calls from the panel.
"""

import os
import time
from typing import Optional
from urllib.parse import urljoin, urlparse

import requests
from fastapi import APIRouter, Header, HTTPException, Query
from fastapi.responses import StreamingResponse

from silence import check_auth

router = APIRouter()

IMAGE_URL = "https://pixabay.com/api/"
VIDEO_URL = "https://pixabay.com/api/videos/"
USER_AGENT = "CapFree/1.0"

TIMEOUT = (15, 45)  # connect, read
ATTEMPTS = 3
RETRY_DELAY = 2.0

# Where Pixabay serves its media. Checked on the request and on every redirect
# hop, so /media/proxy-video cannot be turned into a probe of the network this
# process runs in.
ALLOWED_HOSTS = ("pixabay.com",)

# Search already caps the long edge at 1080p, which tops out near 75 MB; this is
# the ceiling on what the proxy will carry.
MAX_VIDEO_MB = int(os.getenv("MAX_VIDEO_MB", "150"))

# 4K stock footage runs past 50 MB a clip, which is not what a timeline wants.
# Measured on the long edge, because portrait footage is just as heavy: a
# 1440x2560 clip is 4K-class and ran to 131 MB when only width was checked.
MAX_VIDEO_EDGE = int(os.getenv("MAX_VIDEO_EDGE", "1920"))


def _key() -> str:
    key = os.getenv("PIXABAY_API_KEY")
    if not key:
        # A missing key is a deployment gap, not a bad request, and not a crash.
        raise HTTPException(503, "PIXABAY_API_KEY is not configured on the server")
    return key


def _get(url: str, params: dict):
    """Same retry shape as the music proxy: a single timeout is not an outage."""
    last = None
    for attempt in range(ATTEMPTS):
        try:
            response = requests.get(
                url, params=params, timeout=TIMEOUT, headers={"User-Agent": USER_AGENT}
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
    raise HTTPException(503, f"Pixabay is unavailable right now: {last}")


def _payload(response, what: str) -> dict:
    if response.status_code == 400:
        # Pixabay answers a bad key with a plain-text 400.
        raise HTTPException(502, f"Pixabay rejected the request: {response.text[:120]}")
    if response.status_code == 429:
        raise HTTPException(429, f"{what} search is rate limited - try again shortly")
    if response.status_code != 200:
        raise HTTPException(502, f"{what} search failed ({response.status_code})")
    try:
        return response.json()
    except ValueError:
        raise HTTPException(502, f"{what} search returned an unreadable response")


def _tags(raw: str) -> list:
    return [tag.strip() for tag in (raw or "").split(",") if tag.strip()][:6]


def _host_allowed(host: str) -> bool:
    host = (host or "").lower().split(":")[0]
    return any(host == domain or host.endswith("." + domain) for domain in ALLOWED_HOSTS)


@router.get("/media/stickers")
def media_stickers(
    q: str = Query("", max_length=100),
    per_page: int = Query(30, ge=3, le=200),
    page: int = Query(1, ge=1, le=50),
    x_api_key: Optional[str] = Header(None),
):
    """Search Pixabay's vector library for sticker-style cut-outs."""
    check_auth(x_api_key)
    params = {
        "key": _key(),
        "q": q.strip(),
        "image_type": "vector",
        "per_page": per_page,
        "page": page,
        "safesearch": "true",
    }
    data = _payload(_get(IMAGE_URL, params), "Sticker")

    stickers = []
    for hit in data.get("hits") or []:
        # webformatURL is the 640px render; the vector source itself is only
        # offered to logged-in humans, so the raster is what a panel can use.
        url = hit.get("webformatURL") or hit.get("largeImageURL")
        if not url:
            continue
        stickers.append(
            {
                "id": str(hit.get("id")),
                "name": (hit.get("heading") or hit.get("name") or "").strip(),
                "preview_url": hit.get("previewURL") or url,
                "url": url,
                "width": hit.get("webformatWidth") or hit.get("imageWidth") or 0,
                "height": hit.get("webformatHeight") or hit.get("imageHeight") or 0,
                "tags": _tags(hit.get("tags", "")),
                "author": hit.get("user") or "",
                "source_url": hit.get("pageURL") or "",
            }
        )

    return {
        "query": q.strip(),
        "page": page,
        "count": data.get("totalHits", len(stickers)),
        "license": "Pixabay Content License - free for commercial use, no credit required",
        "stickers": stickers,
    }


@router.get("/media/videos")
def media_videos(
    q: str = Query("", max_length=100),
    per_page: int = Query(20, ge=3, le=200),
    page: int = Query(1, ge=1, le=50),
    x_api_key: Optional[str] = Header(None),
):
    """Search Pixabay's stock video library."""
    check_auth(x_api_key)
    params = {
        "key": _key(),
        "q": q.strip(),
        "per_page": per_page,
        "page": page,
        "safesearch": "true",
    }
    data = _payload(_get(VIDEO_URL, params), "Video")

    videos = []
    for hit in data.get("hits") or []:
        files = hit.get("videos") or {}
        # The size names are relative to the clip, not absolute: "medium" is
        # 1280x720 on one upload and 2560x1440 on the next. So pick on the
        # actual resolution -- the largest variant that still fits 1080p, or
        # the smallest one when every variant is bigger than that.
        usable = [v for v in files.values() if isinstance(v, dict) and v.get("url")]
        if not usable:
            continue

        def edge(variant: dict) -> int:
            return max(variant.get("width") or 0, variant.get("height") or 0)

        fits = [v for v in usable if edge(v) <= MAX_VIDEO_EDGE]
        picked = max(fits, key=edge) if fits else min(usable, key=edge)
        videos.append(
            {
                "id": str(hit.get("id")),
                "name": (hit.get("heading") or hit.get("name") or "").strip(),
                "duration": hit.get("duration") or 0,
                "url": picked["url"],
                "width": picked.get("width") or 0,
                "height": picked.get("height") or 0,
                "size": picked.get("size") or 0,
                "thumbnail": picked.get("thumbnail") or "",
                "tags": _tags(hit.get("tags", "")),
                "author": hit.get("user") or "",
                "source_url": hit.get("pageURL") or "",
            }
        )

    return {
        "query": q.strip(),
        "page": page,
        "count": data.get("totalHits", len(videos)),
        "license": "Pixabay Content License - free for commercial use, no credit required",
        "videos": videos,
    }


@router.get("/media/proxy-video")
def media_proxy_video(
    url: str = Query(..., max_length=2000),
    x_api_key: Optional[str] = Header(None),
):
    """Fetch one stock clip's bytes so the browser is not blocked by the CDN.

    Same shape as /music/download -- https only, host allowlist re-checked per
    redirect, size ceiling -- with two differences that the payload forces:

      * The body is streamed rather than buffered. A track is a few MB, but a
        1080p clip runs to 75 MB, and holding that per concurrent request is
        not worth the symmetry.
      * The content type is rewritten. The CDN labels its MP4s
        "binary/octet-stream", which is not something a media importer should
        have to guess at.
    """
    check_auth(x_api_key)

    target = url
    for _hop in range(5):
        parsed = urlparse(target)
        if parsed.scheme != "https":
            raise HTTPException(400, "Only https video URLs are allowed")
        if not _host_allowed(parsed.hostname or ""):
            raise HTTPException(400, f"{parsed.hostname} is not a known stock video host")
        try:
            response = requests.get(
                target,
                timeout=TIMEOUT,
                headers={"User-Agent": USER_AGENT},
                stream=True,
                allow_redirects=False,
            )
        except requests.RequestException as exc:
            raise HTTPException(503, f"Could not reach the video host ({exc.__class__.__name__})")

        if response.status_code in (301, 302, 303, 307, 308):
            location = response.headers.get("location")
            response.close()
            if not location:
                raise HTTPException(502, "The video host redirected without a target")
            # Re-checked at the top of the loop, so a redirect cannot leave the allowlist.
            target = urljoin(target, location)
            continue

        if response.status_code != 200:
            response.close()
            raise HTTPException(502, f"The video host returned {response.status_code}")

        limit = MAX_VIDEO_MB * 1024 * 1024
        declared = response.headers.get("content-length")
        if declared and declared.isdigit() and int(declared) > limit:
            response.close()
            raise HTTPException(413, f"That clip is larger than {MAX_VIDEO_MB} MB")

        def body():
            """Stops at the ceiling even when the host declared no length."""
            sent = 0
            try:
                for chunk in response.iter_content(256 * 1024):
                    sent += len(chunk)
                    if sent > limit:
                        break
                    yield chunk
            finally:
                response.close()

        headers = {"Cache-Control": "private, max-age=3600"}
        # Passing the length through is what gives the client real progress.
        if declared and declared.isdigit():
            headers["Content-Length"] = declared

        return StreamingResponse(body(), media_type="video/mp4", headers=headers)

    raise HTTPException(502, "The video host redirected too many times")
