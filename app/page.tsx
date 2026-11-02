import Link from "next/link";
import {
  AudioLines,
  Captions,
  Eraser,
  FileText,
  Mic,
  Scissors,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

const FEATURES: Array<{ icon: LucideIcon; title: string; body: string }> = [
  {
    icon: Captions,
    title: "Auto Captions",
    body: "Whisper transcribes your speech and drops timed captions onto the timeline.",
  },
  {
    icon: Mic,
    title: "Vocal Split",
    body: "Demucs pulls vocals and backing music apart into two editable tracks.",
  },
  {
    icon: Scissors,
    title: "Filler Remover",
    body: "Finds every um, uh and like, then cuts the ones you tick.",
  },
  {
    icon: AudioLines,
    title: "Beat Sync",
    body: "Detects the tempo of a track and lands your cuts on the beat.",
  },
  {
    icon: Eraser,
    title: "Background Removal",
    body: "Strips the background off any shot for a clean transparent cut-out.",
  },
  {
    icon: FileText,
    title: "Transcript Editing",
    body: "Edit the words and the video follows — delete a sentence, lose the footage.",
  },
];

export default function Home() {
  return (
    <div className="capfree-scroll h-full overflow-y-auto bg-[#0d0d0f]">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5 sm:px-8">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#00d4b4]">
            <Scissors className="h-4 w-4 text-black" />
          </span>
          <span className="text-lg font-bold tracking-tight text-white">CapFree</span>
        </div>
        <Link
          href="/editor"
          className="rounded-lg border border-[#2a2a30] px-3 py-1.5 text-[13px] text-[#c8c8ce] transition-colors duration-150 hover:border-[#00d4b4] hover:text-white"
        >
          Launch Editor
        </Link>
      </header>

      <main className="mx-auto w-full max-w-5xl px-5 sm:px-8">
        <section className="flex flex-col items-center pt-12 text-center sm:pt-20">
          <h1 className="max-w-3xl text-[34px] font-bold leading-[1.1] tracking-tight text-white sm:text-5xl lg:text-6xl">
            The free video editor with no watermarks, no account,{" "}
            <span className="text-[#00d4b4]">no ByteDance.</span>
          </h1>
          <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-[#888899] sm:mt-6 sm:text-lg">
            CapCut features. Open source. Runs in your browser.
          </p>
          <Link
            href="/editor"
            className="mt-8 rounded-xl bg-[#00d4b4] px-7 py-3 text-[15px] font-semibold text-black transition-colors duration-150 hover:bg-[#00e6c4] sm:mt-10 sm:px-8 sm:text-lg"
          >
            Launch Editor →
          </Link>
        </section>

        <section className="mt-14 flex items-center justify-center gap-2.5 rounded-xl border border-[#2a2a30] bg-[#111114] px-4 py-4 text-center sm:mt-20 sm:py-5">
          <ShieldCheck className="h-4 w-4 shrink-0 text-[#00d4b4]" aria-hidden />
          <p className="text-[13px] font-medium text-[#c8c8ce] sm:text-[15px]">
            Your footage never leaves your machine.
          </p>
        </section>

        <section className="mt-14 sm:mt-20">
          <h2 className="text-center text-[22px] font-bold tracking-tight text-white sm:text-3xl">
            Everything the paid editors charge for
          </h2>
          <ul className="mt-8 grid grid-cols-1 gap-3 sm:mt-10 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <li
                key={title}
                className="rounded-xl border border-[#2a2a30] bg-[#111114] p-4 transition-colors duration-150 hover:border-[#00d4b4] sm:p-5"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#1e1e24]">
                  <Icon className="h-4.5 w-4.5 text-[#00d4b4]" aria-hidden />
                </span>
                <h3 className="mt-3 text-[15px] font-semibold text-white">{title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-[#888899]">{body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-14 flex flex-col items-center text-center sm:mt-20">
          <p className="text-[15px] text-[#c8c8ce] sm:text-lg">Ready when you are.</p>
          <Link
            href="/editor"
            className="mt-4 rounded-xl bg-[#00d4b4] px-7 py-3 text-[15px] font-semibold text-black transition-colors duration-150 hover:bg-[#00e6c4]"
          >
            Launch Editor →
          </Link>
        </section>
      </main>

      <footer className="mx-auto mt-16 w-full max-w-5xl border-t border-[#2a2a30] px-5 py-8 text-center sm:mt-24 sm:px-8">
        <p className="text-[13px] text-[#888899]">CapFree is free forever. No login required.</p>
      </footer>
    </div>
  );
}
