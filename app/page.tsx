import Link from "next/link";

const GITHUB = "https://github.com/Ziko67890/capfree";

const FEATURES: Array<{ emoji: string; title: string; body: string }> = [
  {
    emoji: "🤖",
    title: "AI Auto-Captions",
    body: "Whisper-powered speech recognition. 20+ languages, editable transcript, burn to video.",
  },
  {
    emoji: "🎙️",
    title: "Vocal Isolation",
    body: "Demucs AI separates voice from background music. Download stems or drop them in the timeline.",
  },
  {
    emoji: "✂️",
    title: "Remove Silence",
    body: "FFmpeg detects and cuts dead air automatically. Set the threshold, preview, done.",
  },
  {
    emoji: "🎵",
    title: "Beat Sync",
    body: "librosa detects beats. One click snaps your cuts to the rhythm of your music.",
  },
  {
    emoji: "📐",
    title: "Auto Reframe",
    body: "OpenCV tracks your subject and reframes for any aspect ratio — 9:16, 1:1, 4:3.",
  },
  {
    emoji: "🔼",
    title: "AI Upscale",
    body: "Real-ESRGAN boosts old footage to 4K. Sharpen faces. Rescue low-res clips.",
  },
  {
    emoji: "⚡",
    title: "Speed Control",
    body: "0.25× to 4× speed. Reverse. Freeze frame. Speed presets with a single click.",
  },
  {
    emoji: "💾",
    title: "Auto-Save",
    body: "Your project saves every 60 seconds. Close the tab, come back — it's all there.",
  },
  {
    emoji: "🖥️",
    title: "Desktop App",
    body: "Download for Windows, Mac, or Linux. Same editor, no browser needed.",
  },
];

const TRANSCRIPT_POINTS = [
  "Delete a sentence and the footage goes with it.",
  "Fix a typo and the burned caption updates.",
  "Click any word to jump the playhead there.",
  "Export the transcript as plain text whenever you like.",
];

const OPEN_SOURCE_POINTS: Array<{ emoji: string; title: string; body: string }> = [
  {
    emoji: "🔓",
    title: "No lock-in",
    body: "Your projects are plain data. Walk away whenever you want.",
  },
  {
    emoji: "🌍",
    title: "Community-built",
    body: "Anyone can file an issue, send a patch, or fork the whole thing.",
  },
  {
    emoji: "🛡️",
    title: "Auditable",
    body: "Read every line that touches your footage. Nothing is hidden.",
  },
];

const TECH_TAGS = [
  "Next.js 16",
  "React 19",
  "TypeScript",
  "FastAPI",
  "Python",
  "Docker",
  "MIT License",
];

const TRANSCRIPT_DEMO: Array<{ time: string; before: string; cut: string; after: string }> = [
  { time: "0:03", before: "So today I want to show you", cut: " um ", after: "the new workflow." },
  { time: "0:11", before: "It takes about", cut: " like ", after: "two minutes end to end." },
  { time: "0:18", before: "And that's", cut: " basically ", after: "the whole thing." },
];

const PRIVACY_POINTS = [
  "No watermark",
  "No account required",
  "No ByteDance",
  "No data collection",
];

const FOOTER_LINKS: Array<{ label: string; href: string; external?: boolean }> = [
  { label: "Editor", href: "/editor" },
  { label: "GitHub", href: GITHUB, external: true },
  { label: "Desktop App", href: "#" },
  { label: "MIT License", href: GITHUB, external: true },
];

function Mark({ className }: { className?: string }) {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden className={className}>
      <circle cx="7" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <circle cx="7" cy="20" r="3.5" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <line x1="9.5" y1="10" x2="22" y2="13.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="9.5" y1="18" x2="22" y2="13.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <polygon points="20,11.5 25,13.5 20,15.5" fill="currentColor" />
    </svg>
  );
}

function Wordmark() {
  return (
    <span className="flex items-center gap-2 text-[var(--fg)]">
      <Mark />
      <span className="text-[19px] font-extrabold tracking-tight">CapFree</span>
    </span>
  );
}

const PRIMARY_BUTTON =
  "inline-flex h-11 items-center justify-center rounded-[var(--radius)] bg-[var(--accent)] px-5 text-[15px] font-semibold text-[var(--accent-fg)] transition-opacity duration-150 hover:opacity-85";

const SECONDARY_BUTTON =
  "inline-flex h-11 items-center justify-center rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] px-5 text-[15px] font-semibold text-[var(--fg)] transition-colors duration-150 hover:border-[var(--fg3)]";

function Eyebrow({ children }: { children: string }) {
  return (
    <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--fg3)]">
      {children}
    </p>
  );
}

export default function Home() {
  return (
    <div className="capfree-landing capfree-scroll h-full overflow-y-auto">
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--bg)]">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" aria-label="CapFree home">
            <Wordmark />
          </Link>
          <nav className="hidden items-center gap-7 md:flex">
            <a href="#features" className="text-[14px] text-[var(--fg2)] transition-colors duration-150 hover:text-[var(--fg)]">
              Features
            </a>
            <a href="#transcript" className="text-[14px] text-[var(--fg2)] transition-colors duration-150 hover:text-[var(--fg)]">
              Transcript Editor
            </a>
            <a href="#open-source" className="text-[14px] text-[var(--fg2)] transition-colors duration-150 hover:text-[var(--fg)]">
              Open Source
            </a>
          </nav>
          <Link
            href="/editor"
            className="inline-flex h-9 items-center justify-center rounded-[var(--radius)] bg-[var(--accent)] px-4 text-[14px] font-semibold text-[var(--accent-fg)] transition-opacity duration-150 hover:opacity-85"
          >
            Launch Editor →
          </Link>
        </div>
      </header>

      <main>
        <section className="mx-auto w-full max-w-6xl px-6 pb-20 pt-[100px] text-center">
          <h1 className="mx-auto max-w-4xl text-[44px] font-extrabold leading-[1.05] tracking-[-0.02em] text-[var(--fg)] sm:text-[64px]">
            Video editing,
            <br />
            <span className="font-normal italic text-[var(--fg3)]">without the catch.</span>
          </h1>
          <p className="mx-auto mt-7 max-w-2xl text-[17px] leading-relaxed text-[var(--fg2)] sm:text-[19px]">
            A full-featured video editor that runs in your browser. No watermark. No account. No
            ByteDance.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link href="/editor" className={PRIMARY_BUTTON}>
              Launch Editor →
            </Link>
            <a href="#" className={SECONDARY_BUTTON}>
              Download Desktop App
            </a>
            <a href={GITHUB} target="_blank" rel="noreferrer noopener" className={SECONDARY_BUTTON}>
              GitHub ↗
            </a>
          </div>
        </section>

        <section id="features" className="scroll-mt-20 border-t border-[var(--border)] bg-[var(--bg2)]">
          <div className="mx-auto w-full max-w-6xl px-6 py-20">
            <h2 className="text-[32px] font-extrabold tracking-[-0.02em] text-[var(--fg)] sm:text-[40px]">
              Everything the paid editors charge for.
            </h2>
            <ul className="mt-10 grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
              {FEATURES.map((feature) => (
                <li
                  key={feature.title}
                  className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] p-5"
                >
                  <span className="text-[22px]" aria-hidden>
                    {feature.emoji}
                  </span>
                  <h3 className="mt-3 text-[16px] font-bold text-[var(--fg)]">{feature.title}</h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-[var(--fg2)]">{feature.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="transcript" className="scroll-mt-20 border-t border-[var(--border)]">
          <div className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-12 px-6 py-20 lg:grid-cols-2">
            <div>
              <Eyebrow>What sets CapFree apart</Eyebrow>
              <h2 className="text-[32px] font-extrabold leading-tight tracking-[-0.02em] text-[var(--fg)] sm:text-[40px]">
                Edit your video by editing text.
              </h2>
              <p className="mt-5 text-[16px] leading-relaxed text-[var(--fg2)]">
                CapFree transcribes your footage, then treats the transcript as the timeline. Select
                the words you do not want and the video loses those frames — no scrubbing for the
                exact in and out point.
              </p>
              <ul className="mt-6 flex flex-col gap-3">
                {TRANSCRIPT_POINTS.map((point) => (
                  <li key={point} className="flex gap-3 text-[15px] leading-relaxed text-[var(--fg2)]">
                    <span className="text-[var(--fg)]" aria-hidden>
                      —
                    </span>
                    {point}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg2)] p-5">
              <ul className="flex flex-col gap-3">
                {TRANSCRIPT_DEMO.map((line) => (
                  <li
                    key={line.time}
                    className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] px-4 py-3"
                  >
                    <span className="block font-mono text-[11px] text-[var(--fg3)]">{line.time}</span>
                    <p className="mt-1 text-[15px] leading-relaxed text-[var(--fg)]">
                      {line.before}
                      <span className="text-[var(--fg3)] line-through decoration-[1.5px]">{line.cut}</span>
                      {line.after}
                    </p>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-[13px] text-[var(--fg3)]">
                Struck-through words are cut from the video, not just the text.
              </p>
            </div>
          </div>
        </section>

        <section id="open-source" className="scroll-mt-20 border-t border-[var(--border)] bg-[var(--bg2)]">
          <div className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-12 px-6 py-20 lg:grid-cols-2">
            <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] p-6">
              <h3 className="text-[18px] font-bold text-[var(--fg)]">Why open source?</h3>
              <ul className="mt-5 flex flex-col gap-5">
                {OPEN_SOURCE_POINTS.map((point) => (
                  <li key={point.title} className="flex gap-3">
                    <span className="text-[20px] leading-none" aria-hidden>
                      {point.emoji}
                    </span>
                    <span>
                      <span className="block text-[15px] font-semibold text-[var(--fg)]">
                        {point.title}
                      </span>
                      <span className="mt-1 block text-[14px] leading-relaxed text-[var(--fg2)]">
                        {point.body}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <Eyebrow>Open Source</Eyebrow>
              <h2 className="text-[32px] font-extrabold leading-tight tracking-[-0.02em] text-[var(--fg)] sm:text-[40px]">
                Fork it. Run it. Ship it.
              </h2>
              <p className="mt-5 text-[16px] leading-relaxed text-[var(--fg2)]">
                The whole editor and its Python API are MIT licensed. Clone the repo, bring your own
                server, and the footage never leaves infrastructure you control.
              </p>
              <ul className="mt-6 flex flex-wrap gap-2">
                {TECH_TAGS.map((tag) => (
                  <li
                    key={tag}
                    className="rounded-full border border-[var(--border)] bg-[var(--bg)] px-3 py-1 text-[12px] text-[var(--fg2)]"
                  >
                    {tag}
                  </li>
                ))}
              </ul>
              <div className="mt-7 flex flex-wrap gap-3">
                <a href={GITHUB} target="_blank" rel="noreferrer noopener" className={PRIMARY_BUTTON}>
                  Star on GitHub ★
                </a>
                <a href={GITHUB} target="_blank" rel="noreferrer noopener" className={SECONDARY_BUTTON}>
                  Read the docs
                </a>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-[var(--accent)] text-[var(--accent-fg)]">
          <div className="mx-auto w-full max-w-6xl px-6 py-20 text-center">
            <h2 className="text-[32px] font-extrabold tracking-[-0.02em] sm:text-[40px]">
              Your videos stay yours.
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-[17px] leading-relaxed opacity-80">
              CapFree runs locally in your browser or on your own server. We don&apos;t have your
              footage, so we can&apos;t sell it.
            </p>
            <ul className="mt-9 flex flex-wrap items-center justify-center gap-x-7 gap-y-3">
              {PRIVACY_POINTS.map((point) => (
                <li key={point} className="flex items-center gap-2 text-[15px] font-medium">
                  <span aria-hidden>✓</span>
                  {point}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--border)] bg-[var(--bg)]">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <Wordmark />
            <nav className="flex flex-wrap items-center gap-6">
              {FOOTER_LINKS.map((link) =>
                link.external ? (
                  <a
                    key={link.label}
                    href={link.href}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-[14px] text-[var(--fg2)] transition-colors duration-150 hover:text-[var(--fg)]"
                  >
                    {link.label}
                  </a>
                ) : link.href.startsWith("/") ? (
                  <Link
                    key={link.label}
                    href={link.href}
                    className="text-[14px] text-[var(--fg2)] transition-colors duration-150 hover:text-[var(--fg)]"
                  >
                    {link.label}
                  </Link>
                ) : (
                  <a
                    key={link.label}
                    href={link.href}
                    className="text-[14px] text-[var(--fg2)] transition-colors duration-150 hover:text-[var(--fg)]"
                  >
                    {link.label}
                  </a>
                ),
              )}
            </nav>
          </div>
          <p className="text-[13px] text-[var(--fg3)]">© 2026 CapFree · MIT License</p>
        </div>
      </footer>
    </div>
  );
}
