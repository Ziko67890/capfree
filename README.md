# CapFree — Free Video Editor

A full-featured, CapCut-style video editor. Browser frontend + Python backend. Free forever — no account, no payment, no watermarks.

---

## Project structure

```
capfree/
│
├── app/                          ← FRONTEND (Next.js)
│   ├── page.tsx                     Landing page
│   ├── layout.tsx                   Root layout (dark theme)
│   ├── globals.css                  Global styles + Elah editor CSS
│   └── editor/
│       ├── page.tsx                 Editor route
│       ├── EditorShell.tsx          Main editor: provider + layout
│       └── components/
│           ├── TopBar.tsx           Header bar (logo, undo/redo, export)
│           ├── PlaybackControls.tsx Play/pause, scrub bar, loop, timecode
│           └── ExportModal.tsx      Export dialog (480p/720p/1080p MP4)
│
├── api/                          ← BACKEND (Python / FastAPI)
│   ├── main.py                      FastAPI app, CORS, /captions endpoint
│   ├── silence.py                   /silence/detect, /silence/remove
│   ├── fillers.py                   /fillers/detect, /fillers/remove
│   ├── removebg.py                  /removebg, /removebg/batch
│   ├── beats.py                     /beats, /beat-sync
│   ├── tts.py                       /tts (ElevenLabs)
│   ├── vocals.py                    /vocals/isolate, /vocals/music
│   ├── upscale.py                   /upscale (Real-ESRGAN)
│   ├── tracking.py                  /track (OpenCV)
│   ├── requirements.txt             Python dependencies
│   └── Dockerfile                   Production container (Railway / Render)
│
├── package.json                  ← Frontend dependencies
├── next.config.ts
├── tsconfig.json
└── README.md                     ← You are here
```

---

## Frontend

Built with **Next.js 16**, TypeScript, Tailwind CSS, and the [@elah/editor](https://www.elah.dev) SDK (Apache-2.0).

### Features

- Multi-track timeline (video + audio) with drag-and-drop
- Real-time WebGL2 GPU preview
- Media library: import videos, images, audio by drag-and-drop
- Text & shape overlays via the Elements panel
- In-browser MP4 export (WebCodecs, H.264 + AAC) — 480p / 720p / 1080p
- No watermark, no login, no payment

### Run the frontend

```bash
npm install
npm run dev -- --port 4721
# → http://localhost:4721
```

---

## Backend

Built with **FastAPI** + **FFmpeg** + open-source ML models.

### API endpoints

| Endpoint             | Method | What it does                                    |
|----------------------|--------|-------------------------------------------------|
| `GET  /health`       | GET    | Health check                                    |
| `POST /captions`     | POST   | Transcribe audio → captions (JSON / SRT / VTT)  |
| `POST /silence/detect` | POST | Find silent segments in a video                 |
| `POST /silence/remove` | POST | Cut silent segments, return trimmed video       |
| `POST /fillers/detect`  | POST | Find filler words (um, uh, like…)              |
| `POST /fillers/remove`  | POST | Cut filler words, return cleaned video          |
| `POST /removebg`     | POST   | Remove background from an image → transparent PNG |
| `POST /removebg/batch` | POST | Batch background removal (up to 10 images)      |
| `POST /beats`        | POST   | Detect BPM and beat timestamps from music       |
| `POST /beat-sync`    | POST   | Sync clips to beats → rendered MP4 or JSON plan |
| `POST /tts`          | POST   | Text-to-speech via ElevenLabs → streamed MP3    |
| `POST /vocals/isolate` | POST | Demucs vocal isolation → vocals MP3             |
| `POST /vocals/music` | POST   | Demucs vocal isolation → accompaniment MP3      |
| `POST /upscale`      | POST   | Real-ESRGAN upscale of an image or short video  |
| `POST /track`        | POST   | Track an object with OpenCV → per-frame boxes   |

### Run the backend locally

```bash
cd api
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
# → http://localhost:8000/docs  (Swagger UI)
```

### Deploy with Docker

```bash
cd api
docker build -t capfree-api .
docker run -p 8000:8000 capfree-api
```

### Environment variables

| Variable         | Default  | Description                            |
|------------------|----------|----------------------------------------|
| `WHISPER_MODEL`  | `base`   | Whisper model size (tiny/base/small/medium/large-v3) |
| `MAX_UPLOAD_MB`  | `200`    | Maximum upload size in MB              |
| `API_KEY`        | *(none)* | Optional API key for auth (leave unset = open) |
| `ELEVENLABS_API_KEY` | *(none)* | Required for `POST /tts`                    |
| `PORT`           | `8000`   | Server port (Railway sets this automatically) |

---

## Roadmap

| #  | Feature                              | Tools               | Status       |
|----|--------------------------------------|----------------------|--------------|
| 1  | Timeline, trim, split, speed         | Elah SDK             | ✅ Partial    |
| 2  | Auto captions with animated styles   | Whisper              | ✅ Backend    |
| 3  | Silence and filler cutter            | Whisper + FFmpeg     | ✅ Backend    |
| 4  | Background removal                   | rembg                | ✅ Backend    |
| 5  | Text-to-speech                       | ElevenLabs           | ✅ Backend    |
| 6  | Beat sync                            | librosa              | ✅ Backend    |
| 7  | Vocal isolation / audio cleanup      | Demucs + FFmpeg      | ✅ Backend    |
| 8  | Motion tracking                      | OpenCV               | ✅ Backend    |
| 9  | Upscaling                            | Real-ESRGAN          | ✅ Backend    |
| 10 | Brand kits, templates, batch mode    | n8n hooks            | ⬜ Not started |

---

## License

Frontend engine: Apache-2.0 (Elah). Backend: your own code.
