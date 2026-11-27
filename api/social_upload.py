"""Connecting CapFree to YouTube, TikTok and Instagram, and posting to them.

Three platforms, three genuinely different shapes, and it is worth being
plain about them rather than pretending they are one thing behind a tidy
interface:

  YouTube    works exactly as you would hope. OAuth once, then a resumable
             upload of the file on disk. Fully implemented here.

  TikTok     takes the bytes directly: initialise, PUT the file, poll until
             TikTok has processed it. Implemented -- but an app that has not
             passed TikTok's audit can only create private posts, whoever is
             signed in. That is their restriction, not a gap here.

  Instagram  does not accept an upload at all. The Graph API publishes a Reel
             by being handed a *public URL* it can fetch for itself, so a file
             sitting in the user's Videos folder cannot be posted without
             being hosted somewhere first. This module implements the real
             flow and refuses clearly when there is no public URL, rather than
             failing somewhere less obvious.

             The spec this was built from named the Instagram Basic Display
             API. That API was shut down on 4 December 2024 and could never
             publish anything in the first place -- it was read-only. What is
             used here is the Instagram Graph API, which needs a Business or
             Creator account linked to a Facebook Page.

Every credential is read from the environment. Nothing is written into this
file, and the tokens the OAuth flows return are kept in api/tokens.json, which
is gitignored -- it holds live account access and must never be committed.
"""

import json
import os
import secrets
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests
from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel, Field

router = APIRouter()

TOKENS_PATH = Path(__file__).with_name("tokens.json")
API_BASE = os.getenv("CAPFREE_API_BASE", "http://localhost:8000")
HTTP_TIMEOUT = 30

PLATFORMS = ("youtube", "tiktok", "instagram")

# Short-lived, in-memory, and not a security boundary on its own: it only
# proves a callback belongs to a flow this process started.
_pending_states: Dict[str, str] = {}


def check_auth(x_api_key: Optional[str]):
    api_key = os.getenv("API_KEY")
    if api_key and x_api_key != api_key:
        raise HTTPException(401, "Invalid API key")


def env(name: str) -> Optional[str]:
    value = os.getenv(name)
    return value.strip() if value and value.strip() else None


def require_env(*names: str) -> List[str]:
    missing = [name for name in names if not env(name)]
    if missing:
        raise HTTPException(
            400,
            f"Not configured: set {', '.join(missing)} in .env and restart the API.",
        )
    return [env(name) or "" for name in names]


def read_tokens() -> Dict[str, Any]:
    if not TOKENS_PATH.exists():
        return {}
    try:
        data = json.loads(TOKENS_PATH.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return {}
    return data if isinstance(data, dict) else {}


def write_tokens(platform: str, record: Dict[str, Any]) -> None:
    """Merge one platform's tokens into tokens.json.

    Read-modify-write so connecting one account never drops another, and
    written through a temp file so an interrupted write cannot leave the file
    half-parsed and every account apparently disconnected.
    """
    tokens = read_tokens()
    tokens[platform] = record
    temp = TOKENS_PATH.with_suffix(".json.tmp")
    temp.write_text(json.dumps(tokens, indent=2), encoding="utf-8")
    temp.replace(TOKENS_PATH)
    try:
        # Owner-only where the platform honours it; a no-op on Windows.
        TOKENS_PATH.chmod(0o600)
    except OSError:
        pass


def connected(platform: str) -> Dict[str, Any]:
    record = read_tokens().get(platform)
    if isinstance(record, dict) and record.get("access_token"):
        return record
    raise HTTPException(401, f"{platform.title()} is not connected. Connect it first.")


def done_page(platform: str, account: str = "") -> HTMLResponse:
    who = f" as {account}" if account else ""
    return HTMLResponse(
        f"""<!doctype html><meta charset="utf-8">
<title>{platform.title()} connected</title>
<body style="font:16px system-ui;background:#111113;color:#f0f0f2;
display:grid;place-items:center;height:100vh;margin:0">
<div style="text-align:center">
<div style="font-size:40px">✓</div>
<h1 style="font-size:18px;margin:12px 0 4px">{platform.title()} connected{who}!</h1>
<p style="color:#888;font-size:13px;margin:0">You can close this tab.</p>
</div></body>"""
    )


def new_state(platform: str) -> str:
    state = secrets.token_urlsafe(24)
    _pending_states[state] = platform
    return state


def check_state(platform: str, state: Optional[str]) -> None:
    if not state or _pending_states.pop(state, None) != platform:
        raise HTTPException(400, "That sign-in link did not come from this app. Start again.")


def redirect_uri(platform: str) -> str:
    return f"{API_BASE}/oauth/{platform}/callback"


def post_form(url: str, data: Dict[str, Any], what: str) -> Dict[str, Any]:
    try:
        response = requests.post(url, data=data, timeout=HTTP_TIMEOUT)
    except requests.RequestException as err:
        raise HTTPException(502, f"Could not reach {what}: {err}") from err
    if response.status_code >= 400:
        raise HTTPException(502, f"{what} refused the request: {response.text[:300]}")
    try:
        return response.json()
    except ValueError as err:
        raise HTTPException(502, f"{what} did not answer with JSON.") from err


# ---------------------------------------------------------------------------
# YouTube
# ---------------------------------------------------------------------------

# youtube.upload is what posts the video. readonly is only so the connected
# account can be named in the UI; without it the channel shows as blank.
YOUTUBE_SCOPES = (
    "https://www.googleapis.com/auth/youtube.upload "
    "https://www.googleapis.com/auth/youtube.readonly"
)


@router.get("/oauth/youtube/start")
def youtube_start():
    (client_id,) = require_env("GOOGLE_CLIENT_ID")
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri("youtube"),
        "response_type": "code",
        "scope": YOUTUBE_SCOPES,
        # offline + consent is what makes Google return a refresh_token, which
        # is the difference between connecting once and connecting hourly.
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
        "state": new_state("youtube"),
    }
    return RedirectResponse(
        "https://accounts.google.com/o/oauth2/v2/auth?" + requests.compat.urlencode(params)
    )


@router.get("/oauth/youtube/callback")
def youtube_callback(code: Optional[str] = None, state: Optional[str] = None, error: Optional[str] = None):
    if error:
        raise HTTPException(400, f"Google reported: {error}")
    if not code:
        raise HTTPException(400, "Google did not send an authorization code.")
    check_state("youtube", state)
    client_id, client_secret = require_env("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET")

    payload = post_form(
        "https://oauth2.googleapis.com/token",
        {
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri("youtube"),
            "grant_type": "authorization_code",
        },
        "Google",
    )

    channel = ""
    try:
        info = requests.get(
            "https://www.googleapis.com/youtube/v3/channels",
            params={"part": "snippet", "mine": "true"},
            headers={"Authorization": f"Bearer {payload['access_token']}"},
            timeout=HTTP_TIMEOUT,
        ).json()
        channel = info["items"][0]["snippet"]["title"]
    except (requests.RequestException, KeyError, IndexError, ValueError):
        # Naming the channel is a nicety; failing to is not a failed connection.
        channel = ""

    write_tokens(
        "youtube",
        {
            "access_token": payload["access_token"],
            "refresh_token": payload.get("refresh_token", ""),
            "expires_at": time.time() + float(payload.get("expires_in", 3600)),
            "channel": channel,
        },
    )
    return done_page("youtube", channel)


def youtube_access_token() -> str:
    """A usable token, refreshed when the stored one has run out."""
    record = connected("youtube")
    if record.get("expires_at", 0) > time.time() + 60:
        return str(record["access_token"])

    refresh = record.get("refresh_token")
    if not refresh:
        raise HTTPException(401, "YouTube sign-in has expired. Connect it again.")
    client_id, client_secret = require_env("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET")
    payload = post_form(
        "https://oauth2.googleapis.com/token",
        {
            "refresh_token": refresh,
            "client_id": client_id,
            "client_secret": client_secret,
            "grant_type": "refresh_token",
        },
        "Google",
    )
    record["access_token"] = payload["access_token"]
    record["expires_at"] = time.time() + float(payload.get("expires_in", 3600))
    write_tokens("youtube", record)
    return str(record["access_token"])


# ---------------------------------------------------------------------------
# TikTok
# ---------------------------------------------------------------------------

TIKTOK_SCOPES = "user.info.basic,video.upload,video.publish"


@router.get("/oauth/tiktok/start")
def tiktok_start():
    (client_key,) = require_env("TIKTOK_CLIENT_KEY")
    params = {
        "client_key": client_key,
        "scope": TIKTOK_SCOPES,
        "response_type": "code",
        "redirect_uri": redirect_uri("tiktok"),
        "state": new_state("tiktok"),
    }
    return RedirectResponse(
        "https://www.tiktok.com/v2/auth/authorize/?" + requests.compat.urlencode(params)
    )


@router.get("/oauth/tiktok/callback")
def tiktok_callback(code: Optional[str] = None, state: Optional[str] = None, error: Optional[str] = None):
    if error:
        raise HTTPException(400, f"TikTok reported: {error}")
    if not code:
        raise HTTPException(400, "TikTok did not send an authorization code.")
    check_state("tiktok", state)
    client_key, client_secret = require_env("TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET")

    payload = post_form(
        "https://open.tiktokapis.com/v2/oauth/token/",
        {
            "client_key": client_key,
            "client_secret": client_secret,
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": redirect_uri("tiktok"),
        },
        "TikTok",
    )
    if "access_token" not in payload:
        raise HTTPException(502, f"TikTok did not return a token: {str(payload)[:200]}")

    handle = ""
    try:
        info = requests.get(
            "https://open.tiktokapis.com/v2/user/info/",
            params={"fields": "display_name"},
            headers={"Authorization": f"Bearer {payload['access_token']}"},
            timeout=HTTP_TIMEOUT,
        ).json()
        handle = info["data"]["user"]["display_name"]
    except (requests.RequestException, KeyError, ValueError):
        handle = ""

    write_tokens(
        "tiktok",
        {
            "access_token": payload["access_token"],
            "refresh_token": payload.get("refresh_token", ""),
            "expires_at": time.time() + float(payload.get("expires_in", 86400)),
            "open_id": payload.get("open_id", ""),
            "channel": handle,
        },
    )
    return done_page("tiktok", handle)


# ---------------------------------------------------------------------------
# Instagram (Graph API, through Facebook Login)
# ---------------------------------------------------------------------------

INSTAGRAM_SCOPES = (
    "instagram_basic,instagram_content_publish,pages_show_list,business_management"
)
GRAPH = "https://graph.facebook.com/v21.0"


@router.get("/oauth/instagram/start")
def instagram_start():
    (app_id,) = require_env("INSTAGRAM_APP_ID")
    params = {
        "client_id": app_id,
        "redirect_uri": redirect_uri("instagram"),
        "response_type": "code",
        "scope": INSTAGRAM_SCOPES,
        "state": new_state("instagram"),
    }
    return RedirectResponse(
        "https://www.facebook.com/v21.0/dialog/oauth?" + requests.compat.urlencode(params)
    )


@router.get("/oauth/instagram/callback")
def instagram_callback(code: Optional[str] = None, state: Optional[str] = None, error: Optional[str] = None):
    if error:
        raise HTTPException(400, f"Instagram reported: {error}")
    if not code:
        raise HTTPException(400, "Instagram did not send an authorization code.")
    check_state("instagram", state)
    app_id, app_secret = require_env("INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET")

    try:
        payload = requests.get(
            f"{GRAPH}/oauth/access_token",
            params={
                "client_id": app_id,
                "client_secret": app_secret,
                "redirect_uri": redirect_uri("instagram"),
                "code": code,
            },
            timeout=HTTP_TIMEOUT,
        ).json()
    except requests.RequestException as err:
        raise HTTPException(502, f"Could not reach Instagram: {err}") from err
    if "access_token" not in payload:
        raise HTTPException(502, f"Instagram did not return a token: {str(payload)[:200]}")

    token = payload["access_token"]
    ig_user_id, username = "", ""
    try:
        pages = requests.get(
            f"{GRAPH}/me/accounts",
            params={"fields": "instagram_business_account{id,username}", "access_token": token},
            timeout=HTTP_TIMEOUT,
        ).json()
        for page in pages.get("data", []):
            account = page.get("instagram_business_account")
            if account:
                ig_user_id = account.get("id", "")
                username = account.get("username", "")
                break
    except (requests.RequestException, ValueError):
        pass

    if not ig_user_id:
        raise HTTPException(
            400,
            "No Instagram Business or Creator account is linked to that Facebook Page. "
            "Reels can only be published from one of those.",
        )

    write_tokens(
        "instagram",
        {
            "access_token": token,
            "refresh_token": "",
            "expires_at": time.time() + float(payload.get("expires_in", 3600)),
            "ig_user_id": ig_user_id,
            "channel": username,
        },
    )
    return done_page("instagram", username)


# ---------------------------------------------------------------------------
# Status
# ---------------------------------------------------------------------------


@router.get("/auth/status")
def auth_status(x_api_key: Optional[str] = Header(None)):
    """Which platforms are connected, and which could be.

    `configured` is the difference between "you have not signed in yet" and
    "this app has no credentials for that platform", which are very different
    problems and should not look the same in the UI.
    """
    check_auth(x_api_key)
    tokens = read_tokens()
    configured = {
        "youtube": bool(env("GOOGLE_CLIENT_ID") and env("GOOGLE_CLIENT_SECRET")),
        "tiktok": bool(env("TIKTOK_CLIENT_KEY") and env("TIKTOK_CLIENT_SECRET")),
        "instagram": bool(env("INSTAGRAM_APP_ID") and env("INSTAGRAM_APP_SECRET")),
    }
    status: Dict[str, Any] = {}
    for platform in PLATFORMS:
        record = tokens.get(platform)
        status[platform] = bool(isinstance(record, dict) and record.get("access_token"))
    status["configured"] = configured
    status["accounts"] = {
        platform: (tokens.get(platform) or {}).get("channel", "") for platform in PLATFORMS
    }
    return status


# ---------------------------------------------------------------------------
# Uploads
# ---------------------------------------------------------------------------


class YouTubeUpload(BaseModel):
    file_path: str
    title: str = Field(default="CapFree export", max_length=100)
    description: str = ""
    tags: List[str] = Field(default_factory=list)
    privacy: str = "private"


class CaptionUpload(BaseModel):
    file_path: str
    caption: str = ""


def readable_file(raw: str) -> Path:
    """The export to post, checked before any network call is made."""
    path = Path(raw).expanduser()
    if not path.is_absolute():
        raise HTTPException(400, "file_path must be an absolute path")
    try:
        resolved = path.resolve()
        home = Path.home().resolve()
    except OSError as err:
        raise HTTPException(400, f"Could not read that path: {err}") from err
    # The same confinement the export folder uses: this endpoint reads a file
    # off disk on a request's say-so, so it reads only from the user's own
    # files and not from anywhere else on the machine.
    if home not in resolved.parents:
        raise HTTPException(400, "The file must be inside your home directory")
    if not resolved.is_file():
        raise HTTPException(404, f"No such file: {resolved}")
    if resolved.stat().st_size == 0:
        raise HTTPException(400, "That file is empty")
    return resolved


@router.post("/upload/youtube")
def upload_youtube(body: YouTubeUpload, x_api_key: Optional[str] = Header(None)):
    """Resumable upload of a finished export to YouTube."""
    check_auth(x_api_key)
    token = youtube_access_token()
    path = readable_file(body.file_path)
    size = path.stat().st_size

    metadata = {
        "snippet": {
            "title": body.title[:100] or "CapFree export",
            "description": body.description[:5000],
            "tags": [tag for tag in body.tags if tag][:50],
        },
        "status": {"privacyStatus": body.privacy if body.privacy in
                   {"private", "unlisted", "public"} else "private"},
    }

    try:
        start = requests.post(
            "https://www.googleapis.com/upload/youtube/v3/videos",
            params={"uploadType": "resumable", "part": "snippet,status"},
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json; charset=UTF-8",
                "X-Upload-Content-Length": str(size),
                "X-Upload-Content-Type": "video/mp4",
            },
            json=metadata,
            timeout=HTTP_TIMEOUT,
        )
    except requests.RequestException as err:
        raise HTTPException(502, f"Could not reach YouTube: {err}") from err
    if start.status_code >= 400:
        raise HTTPException(502, f"YouTube refused the upload: {start.text[:300]}")

    session_url = start.headers.get("Location")
    if not session_url:
        raise HTTPException(502, "YouTube did not open an upload session.")

    # Streamed from disk rather than read into memory: an export is routinely
    # hundreds of megabytes.
    try:
        with open(path, "rb") as handle:
            finish = requests.put(
                session_url,
                data=handle,
                headers={"Content-Type": "video/mp4", "Content-Length": str(size)},
                timeout=None,
            )
    except (requests.RequestException, OSError) as err:
        raise HTTPException(502, f"The upload failed: {err}") from err
    if finish.status_code >= 400:
        raise HTTPException(502, f"YouTube rejected the file: {finish.text[:300]}")

    video = finish.json()
    video_id = video.get("id", "")
    return {
        "platform": "youtube",
        "id": video_id,
        "url": f"https://youtu.be/{video_id}" if video_id else "",
        "privacy": metadata["status"]["privacyStatus"],
        "bytes": size,
    }


@router.post("/upload/tiktok")
def upload_tiktok(body: CaptionUpload, x_api_key: Optional[str] = Header(None)):
    """Direct post to TikTok: initialise, send the file, then poll.

    An app TikTok has not audited may only create private posts, so this does
    not pretend otherwise -- `privacy` in the response says what was actually
    requested.
    """
    check_auth(x_api_key)
    record = connected("tiktok")
    token = record["access_token"]
    path = readable_file(body.file_path)
    size = path.stat().st_size

    init = post_json(
        "https://open.tiktokapis.com/v2/post/publish/video/init/",
        token,
        {
            "post_info": {
                "title": body.caption[:2200],
                "privacy_level": "SELF_ONLY",
                "disable_duet": False,
                "disable_comment": False,
                "disable_stitch": False,
            },
            # One chunk: TikTok allows a single whole-file part below 64MB and
            # accepts a one-chunk upload above it as long as the numbers agree.
            "source_info": {
                "source": "FILE_UPLOAD",
                "video_size": size,
                "chunk_size": size,
                "total_chunk_count": 1,
            },
        },
        "TikTok",
    )
    data = init.get("data", {})
    upload_url = data.get("upload_url")
    publish_id = data.get("publish_id")
    if not upload_url or not publish_id:
        raise HTTPException(502, f"TikTok did not open an upload: {str(init)[:300]}")

    try:
        with open(path, "rb") as handle:
            sent = requests.put(
                upload_url,
                data=handle,
                headers={
                    "Content-Type": "video/mp4",
                    "Content-Length": str(size),
                    "Content-Range": f"bytes 0-{size - 1}/{size}",
                },
                timeout=None,
            )
    except (requests.RequestException, OSError) as err:
        raise HTTPException(502, f"The upload failed: {err}") from err
    if sent.status_code >= 400:
        raise HTTPException(502, f"TikTok rejected the file: {sent.text[:300]}")

    # TikTok processes after the bytes land; the post is not real until it says so.
    status = "PROCESSING_UPLOAD"
    for _ in range(30):
        time.sleep(2)
        check = post_json(
            "https://open.tiktokapis.com/v2/post/publish/status/fetch/",
            token,
            {"publish_id": publish_id},
            "TikTok",
        )
        status = check.get("data", {}).get("status", status)
        if status in {"PUBLISH_COMPLETE", "FAILED"}:
            break

    if status == "FAILED":
        raise HTTPException(502, "TikTok could not process the video.")
    return {
        "platform": "tiktok",
        "id": publish_id,
        "status": status,
        "privacy": "SELF_ONLY",
        "bytes": size,
    }


def post_json(url: str, token: str, payload: Dict[str, Any], what: str) -> Dict[str, Any]:
    try:
        response = requests.post(
            url,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json; charset=UTF-8",
            },
            json=payload,
            timeout=HTTP_TIMEOUT,
        )
    except requests.RequestException as err:
        raise HTTPException(502, f"Could not reach {what}: {err}") from err
    if response.status_code >= 400:
        raise HTTPException(502, f"{what} refused the request: {response.text[:300]}")
    try:
        return response.json()
    except ValueError as err:
        raise HTTPException(502, f"{what} did not answer with JSON.") from err


class InstagramUpload(CaptionUpload):
    """Instagram fetches the video itself, so it needs a URL it can reach."""

    video_url: str = ""


@router.post("/upload/instagram")
def upload_instagram(body: InstagramUpload, x_api_key: Optional[str] = Header(None)):
    """Publish a Reel through the Instagram Graph API.

    Instagram does not accept bytes. Publishing is: create a media container
    pointing at a URL Instagram can fetch, wait for it to finish downloading
    and transcoding, then publish the container. A local export therefore has
    to be reachable publicly first -- give `video_url`, or set
    PUBLIC_MEDIA_BASE_URL so the export folder can be addressed.
    """
    check_auth(x_api_key)
    record = connected("instagram")
    token = record["access_token"]
    ig_user_id = record.get("ig_user_id")
    if not ig_user_id:
        raise HTTPException(400, "That Instagram connection has no Business account on it.")

    video_url = body.video_url.strip()
    if not video_url:
        base = env("PUBLIC_MEDIA_BASE_URL")
        path = readable_file(body.file_path)
        if not base:
            raise HTTPException(
                400,
                "Instagram fetches the video itself, so it needs a public URL. "
                f"'{path.name}' is only on this machine. Set PUBLIC_MEDIA_BASE_URL "
                "to somewhere the export folder is served from, or pass video_url.",
            )
        video_url = f"{base.rstrip('/')}/{path.name}"

    container = post_form(
        f"{GRAPH}/{ig_user_id}/media",
        {
            "media_type": "REELS",
            "video_url": video_url,
            "caption": body.caption[:2200],
            "access_token": token,
        },
        "Instagram",
    )
    creation_id = container.get("id")
    if not creation_id:
        raise HTTPException(502, f"Instagram did not create the Reel: {str(container)[:300]}")

    # Instagram downloads and transcodes before it will publish.
    state = "IN_PROGRESS"
    for _ in range(60):
        time.sleep(3)
        try:
            check = requests.get(
                f"{GRAPH}/{creation_id}",
                params={"fields": "status_code,status", "access_token": token},
                timeout=HTTP_TIMEOUT,
            ).json()
        except (requests.RequestException, ValueError):
            continue
        state = check.get("status_code", state)
        if state in {"FINISHED", "ERROR", "EXPIRED"}:
            break
    if state != "FINISHED":
        raise HTTPException(502, f"Instagram could not prepare the Reel ({state}).")

    published = post_form(
        f"{GRAPH}/{ig_user_id}/media_publish",
        {"creation_id": creation_id, "access_token": token},
        "Instagram",
    )
    media_id = published.get("id", "")
    return {"platform": "instagram", "id": media_id, "creation_id": creation_id}


@router.post("/auth/disconnect/{platform}")
def disconnect(platform: str, x_api_key: Optional[str] = Header(None)):
    """Forget one platform's tokens."""
    check_auth(x_api_key)
    if platform not in PLATFORMS:
        raise HTTPException(404, f"Unknown platform: {platform}")
    tokens = read_tokens()
    tokens.pop(platform, None)
    temp = TOKENS_PATH.with_suffix(".json.tmp")
    temp.write_text(json.dumps(tokens, indent=2), encoding="utf-8")
    temp.replace(TOKENS_PATH)
    return {"platform": platform, "connected": False}
