<div align="center">

<!-- Replace this comment with your logo image once you have it as a PNG -->
<!-- <img src="public/logo.png" alt="CapFree Logo" width="80" /> -->

# CapFree

**Free, open-source video editor for the browser and desktop.**  
No watermark. No account. No ByteDance.

[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-black.svg)](https://react.dev)
[![FastAPI](https://img.shields.io/badge/FastAPI-Python-black.svg)](https://fastapi.tiangolo.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-black.svg)](https://typescriptlang.org)

[**Launch Editor →**](https://capfree.app) · [Website](https://capfree.app) · [Report a Bug](https://github.com/Ziko67890/capfree/issues) · [Request a Feature](https://github.com/Ziko67890/capfree/issues)

<!-- Add a demo GIF here — record yourself deleting a word from the transcript and watch the video cut -->
<!-- <img src="docs/demo.gif" alt="CapFree Demo" width="100%" /> -->

</div>

---

## What is CapFree?

CapFree is a full-featured video editor that runs entirely in your browser. It packs the AI tools you'd normally pay for — auto-captions, vocal isolation, beat sync, AI upscale — and gives them to you free, forever, with no watermark and no account required.

The source code is MIT-licensed. Host it yourself, fork it, build on top of it.

---

## Features

| Feature | How it works |
|---|---|
| 🤖 **AI Auto-Captions** | Whisper-powered speech recognition. 20+ languages, editable transcript, burn to video |
| 🎙️ **Vocal Isolation** | Demucs AI separates voice from background music. Download stems or drop them in the timeline |
| ✂️ **Remove Silence** | FFmpeg detects and cuts dead air automatically. Set the threshold, preview, done |
| 🎵 **Beat Sync** | librosa detects beats. One click snaps your cuts to the rhythm of your music |
| 📐 **Auto Reframe** | OpenCV tracks your subject and reframes for any aspect ratio — 9:16, 1:1, 4:3 |
| 🔼 **AI Upscale** | Real-ESRGAN boosts old footage to 4K. Sharpen faces. Rescue low-res clips |
| ⚡ **Speed Control** | 0.25× to 4× speed. Reverse. Freeze frame. Speed presets with a single click |
| 💾 **Auto-Save** | Your project saves every 60 seconds. Close the tab, come back — it's all there |
| 🖥️ **Desktop App** | Download for Windows, Mac, or Linux. Same editor, no browser needed |

### The Transcript Editor — your biggest differentiator

Delete a word from the transcript. The video cut happens automatically. It's the fastest way to trim talking-head content — no scrubbing, no razor tool.

- Select words to cut that exact segment from your video
- Click any word to jump to that moment in the timeline
- Retype a word to fix a caption without changing the cut
- Export the edited transcript as `.txt` or `.srt`

---

## Tech Stack

**Frontend**
- Next.js 16 / React 19 / TypeScript
- Tailwind CSS v4
- `@elah/editor` SDK — WebGL2 GPU preview, multi-track timeline, WebCodecs MP4 export
- Electron (desktop app — Windows `.exe`, Mac `.dmg`, Linux AppImage)

**Backend (Python / FastAPI)**
- [Whisper](https://github.com/openai/whisper) — transcription & captions
- [Demucs](https://github.com/facebookresearch/demucs) — vocal isolation
- [Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN) — AI upscaling
- [librosa](https://librosa.org) — beat detection
- [OpenCV](https://opencv.org) + FFmpeg — reframe, silence removal, video processing

---

## Quick Start

### Prerequisites
- Node.js 20+
- Python 3.10+
- FFmpeg installed on your system

### 1. Clone the repo

```bash
git clone https://github.com/Ziko67890/capfree.git
cd capfree
```

### 2. Start the frontend

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 3. Start the ML backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

The backend runs at [http://localhost:8000](http://localhost:8000)

### 4. (Optional) Run the desktop app

```bash
npm run electron:dev
```

---

## Project Structure

```
capfree/
├── app/                  # Next.js app router
│   ├── page.tsx          # Landing page
│   └── editor/           # Editor route
├── components/           # React components
│   ├── panels/           # Editor panels (Text, Captions, Effects…)
│   └── editor/           # Timeline, toolbar, inspector
├── backend/              # Python FastAPI ML backend
│   ├── main.py
│   └── routes/           # /captions, /vocals, /upscale, /reframe…
└── electron/             # Desktop app shell
```

---

## Roadmap

- [x] Multi-track timeline
- [x] AI auto-captions (Whisper)
- [x] Vocal isolation (Demucs)
- [x] Beat sync
- [x] AI upscale (Real-ESRGAN)
- [x] Auto reframe
- [x] Desktop app (Electron)
- [ ] GIF export
- [ ] TTS voiceover
- [ ] Speed curves
- [ ] Collaboration / shared projects

---

## Contributing

Pull requests are welcome. For major changes, open an issue first to discuss what you'd like to change.

1. Fork the repo
2. Create your branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m 'Add my feature'`
4. Push to the branch: `git push origin feature/my-feature`
5. Open a pull request

---

## License

MIT © 2026 [CapFree](https://github.com/Ziko67890/capfree)

---

<div align="center">
Built by <a href="https://github.com/Ziko67890">Ziko67890</a>
</div>
