# CapFree

**Free video editor. No watermark. No account. No ByteDance.**

A CapCut-style video editor that runs in your browser, with a Python backend for the
AI-heavy work. Everything runs on hardware you control.

---

## Quick start

```bash
docker compose up --build
```

That builds and starts both services:

| Service    | URL                     | What it is                        |
|------------|-------------------------|-----------------------------------|
| Editor     | http://localhost:3000   | Next.js frontend                  |
| API        | http://localhost:8000   | FastAPI backend (`/docs` for Swagger) |

The first build is slow — the backend image installs Whisper, Demucs, Real-ESRGAN and
OpenCV, and bakes the background-removal models in so the first request isn't slow.
Later builds are cached.

Open http://localhost:3000 and hit **Launch Editor**.

---

## Your footage never leaves your machine

There is no upload step and no cloud account. Your clips are decoded in the browser with
WebCodecs, and the AI features post to the FastAPI service running in a container next to
it — on your own machine, on localhost. Nothing is sent anywhere else, and there is nothing
to opt out of.

---

## Features

| Feature                 | What it does                                                        | Status |
|-------------------------|---------------------------------------------------------------------|--------|
| **Auto Captions**       | Transcribes speech and drops timed caption clips onto the timeline   | Wired  |
| **Vocal Split**         | Separates vocals from backing music into two editable tracks         | Wired  |
| **Filler Remover**      | Finds every *um*, *uh* and *like*, then cuts the ones you tick       | Wired  |
| **Beat Sync**           | Detects tempo and lands your cuts on the beat                        | Wired  |
| **Background Removal**  | Strips the background off a shot for a transparent cut-out           | Wired  |
| **Transcript Editing**  | Edit the words, the video follows                                    | UI only |

Also in the editor: multi-track timeline, real-time preview, text and stickers, filters,
colour grading, per-clip effects, transitions, translation, and in-browser MP4 export
(H.264 + AAC, 480p/720p/1080p).

"Wired" means the panel calls the backend end to end. "UI only" means the panel is built
but not yet connected — the Reframe, Highlights and AI Avatar panels are in the same state
and are labelled as such in the app.

---

## Tech stack

**Frontend** — Next.js 16, React 19, TypeScript, Tailwind CSS 4, and the
[@elah/editor](https://www.elah.dev) engine (Apache-2.0) for the timeline and preview.

**Backend** — Python with FastAPI and FFmpeg, plus:

| Tool             | Used for                         |
|------------------|----------------------------------|
| **Whisper**      | Transcription, captions, fillers |
| **Demucs**       | Vocal / music separation         |
| **librosa**      | Beat and tempo detection         |
| **Real-ESRGAN**  | Upscaling                        |
| **OpenCV**       | Motion tracking                  |
| **rembg**        | Background removal               |

---

## Running without Docker

Two terminals.

```bash
# frontend
npm install
npm run dev
# → http://localhost:3000
```

```bash
# backend
cd api
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
# → http://localhost:8000/docs
```

The frontend defaults to `http://localhost:8000` when `NEXT_PUBLIC_API_URL` is unset, so
this works with no configuration.

---

## Configuration

| Variable               | Default                 | What it does                                  |
|------------------------|-------------------------|-----------------------------------------------|
| `NEXT_PUBLIC_API_URL`  | `http://localhost:8000` | Where the browser sends API calls              |
| `WHISPER_MODEL`        | `base`                  | `tiny` / `base` / `small` / `medium` / `large-v3` |
| `MAX_UPLOAD_MB`        | `200`                   | Largest accepted upload                        |
| `API_KEY`              | *(unset)*               | If set, requires an `x-api-key` header         |
| `ELEVENLABS_API_KEY`   | *(unset)*               | Needed only for `POST /tts`                    |

`NEXT_PUBLIC_API_URL` is inlined into the browser bundle when the frontend is **built**,
not when it starts. In Docker it is passed as a build arg; changing it means rebuilding
the frontend image, not just restarting it.

---

## API

`GET /health` plus:

| Endpoint                | Does                                              |
|-------------------------|---------------------------------------------------|
| `POST /captions`        | Transcribe audio → captions (JSON / SRT / VTT)    |
| `POST /silence/detect`  | Find silent segments                              |
| `POST /silence/remove`  | Cut silence, return trimmed video                 |
| `POST /fillers/detect`  | Find filler words                                 |
| `POST /fillers/remove`  | Cut filler words, return cleaned video            |
| `POST /removebg`        | Background removal → transparent PNG              |
| `POST /removebg/batch`  | Batch background removal (up to 10 images)        |
| `POST /beats`           | Detect BPM and beat timestamps                    |
| `POST /beat-sync`       | Sync clips to beats                               |
| `POST /tts`             | Text-to-speech → MP3                              |
| `POST /vocals/isolate`  | Vocals only                                       |
| `POST /vocals/music`    | Accompaniment only                                |
| `POST /upscale`         | Real-ESRGAN upscale                               |
| `POST /track`           | Track an object → per-frame boxes                 |
| `POST /translate`       | Translate text                                    |
| `POST /subtitles/burn`  | Burn subtitles into a video                       |

Full Swagger UI at http://localhost:8000/docs.

---

## Project layout

```
capfree/
├── app/                  Next.js frontend
│   ├── page.tsx            Landing page
│   ├── layout.tsx          Root layout
│   └── editor/             The editor: shell, panels, timeline helpers
├── api/                  FastAPI backend (one module per capability)
│   └── Dockerfile          Backend image
├── Dockerfile            Frontend image
└── docker-compose.yml    Both services
```

---

## License

MIT.

The Elah editor engine is Apache-2.0. The ML models carry their own licences — check
Whisper, Demucs, Real-ESRGAN and rembg before shipping commercially.
