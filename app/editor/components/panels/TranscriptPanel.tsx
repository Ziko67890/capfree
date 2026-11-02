"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { usePlaybackStore, useTimelineEngine } from "@elah/editor";
import { requestBurnSubtitles, requestCaptions } from "../../api";
import { seekFrame } from "../../captionActions";
import { SPOKEN_LANGUAGES } from "../../library";
import { fileFromClip, swapClipMedia, targetVideoClip } from "../../timelineMedia";
import {
  buildLines,
  cutRanges,
  cutRangesFromTimeline,
  reflow,
  sourceSecondToFrame,
  toPlainText,
  toSrt,
  type TranscriptLine,
} from "../../transcriptEdit";
import { useApiJob } from "../../useApiJob";
import { useSelectedClip } from "../../useSelectedClip";
import { ErrorNote, HintNote, PanelBody, PrimaryButton, QuietButton } from "../chrome";
import { useToast } from "../toast";

interface TranscriptDoc {
  clipId: string;
  trackId: string;
  lines: TranscriptLine[];
}

function stamp(seconds: number): string {
  const safe = Math.max(0, seconds);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function download(text: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function TranscriptPanel({ fps, active }: { fps: number; active: boolean }) {
  const engine = useTimelineEngine();
  const selected = useSelectedClip();
  const toast = useToast();
  const job = useApiJob();
  const currentFrame = usePlaybackStore((state) => state.currentFrame);

  const [language, setLanguage] = useState("auto");
  const [doc, setDoc] = useState<TranscriptDoc | null>(null);
  // Bumped on every cut so React rebuilds the contentEditable lines. Typing
  // alone must not bump it, or the caret jumps mid-word.
  const [revision, setRevision] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const drafts = useRef(new Map<string, string>());
  const loadedFor = useRef<string | null>(null);

  const videoClip = selected?.clip.type === "video" ? selected : null;
  // Memoised so the highlight effect below does not re-run on every render.
  const words = useMemo(() => (doc ? reflow(doc.lines) : []), [doc]);
  const pending = useMemo(() => (doc ? cutRanges(doc.lines) : []), [doc]);

  function load(clipId?: string) {
    job.run("captions", async () => {
      const located = (clipId ? engine.findClip(clipId) : null) ?? targetVideoClip(engine);
      if (!located) throw new Error("Select a video clip on the timeline first.");
      const file = await fileFromClip(located.clip);
      const result = await requestCaptions(file, language);
      const lines = buildLines(result.captions ?? []);
      if (lines.length === 0) throw new Error("No speech found in this clip.");
      drafts.current.clear();
      setDoc({ clipId: located.clip.id, trackId: located.trackId, lines });
      setRevision((value) => value + 1);
      toast(`Transcript ready — ${lines.length} lines`);
    });
  }

  // Auto-load for a newly selected video clip. Deferred out of the effect body
  // so the job's setState never runs synchronously during commit.
  const selectedVideoId = videoClip?.clip.id ?? null;
  useEffect(() => {
    if (!active || !selectedVideoId) return;
    if (loadedFor.current === selectedVideoId) return;
    const timer = window.setTimeout(() => {
      loadedFor.current = selectedVideoId;
      load(selectedVideoId);
    }, 200);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, selectedVideoId]);

  /** Highlight and scroll the playing word by touching the DOM, not React. */
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || !doc) return;
    const located = engine.findClip(doc.clipId);
    if (!located) return;

    const offset = located.clip.startFrame - (located.clip.sourceStartFrame ?? 0);
    const played = (currentFrame - offset) / fps;

    let activeId: string | null = null;
    for (const word of words) {
      if (played >= word.displayStart && played < word.displayEnd) {
        activeId = word.id;
        break;
      }
    }

    for (const node of root.querySelectorAll<HTMLElement>("[data-word-id]")) {
      const on = node.dataset.wordId === activeId;
      node.classList.toggle("bg-[#00d4b4]", on);
      node.classList.toggle("text-black", on);
      node.classList.toggle("rounded-sm", on);
      if (on) node.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [currentFrame, doc, engine, fps, revision, words]);

  /** Word ids the caret selection touches. */
  function selectedWordIds(): string[] {
    const selection = window.getSelection();
    const root = scrollRef.current;
    if (!selection || !root || selection.isCollapsed || selection.rangeCount === 0) return [];
    const range = selection.getRangeAt(0);
    const ids: string[] = [];
    for (const node of root.querySelectorAll<HTMLElement>("[data-word-id]")) {
      if (range.intersectsNode(node) && node.dataset.wordId) ids.push(node.dataset.wordId);
    }
    return ids;
  }

  function cutWordIds(ids: ReadonlyArray<string>) {
    if (!doc || ids.length === 0) return;
    const located = engine.findClip(doc.clipId);
    if (!located) {
      toast("That clip is no longer on the timeline.", "error");
      return;
    }

    const marked: TranscriptLine[] = doc.lines.map((line) => ({
      ...line,
      words: line.words.map((word) => (ids.includes(word.id) ? { ...word, cut: true } : word)),
    }));
    // Only the ranges this edit adds — earlier cuts already left the timeline.
    const ranges = cutRanges(marked).filter(
      (range) => !pending.some((done) => done.start === range.start && done.end === range.end),
    );

    const applied = cutRangesFromTimeline(engine, fps, located, ranges);
    if (applied === 0) {
      toast("Nothing to cut there.", "error");
      return;
    }
    setDoc({ ...doc, lines: marked });
    setRevision((value) => value + 1);
    toast(`Cut ${applied} segment${applied === 1 ? "" : "s"} from the timeline`);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Delete" && event.key !== "Backspace") return;
    const ids = selectedWordIds();
    if (ids.length === 0) return;

    if (ids.length === 1) {
      // A part-word selection is a typo fix, not a cut — let it through.
      const word = doc?.lines.flatMap((line) => line.words).find((item) => item.id === ids[0]);
      const picked = window.getSelection()?.toString().trim() ?? "";
      if (!word || picked !== word.text.trim()) return;
    }
    event.preventDefault();
    cutWordIds(ids);
  }

  /** Typing goes to a ref; committing on blur keeps React off the caret. */
  function captureDraft(event: FormEvent<HTMLDivElement>) {
    for (const node of event.currentTarget.querySelectorAll<HTMLElement>("[data-word-id]")) {
      if (node.dataset.wordId) drafts.current.set(node.dataset.wordId, node.textContent ?? "");
    }
  }

  function commitDrafts() {
    if (!doc || drafts.current.size === 0) return;
    const edits = drafts.current;
    let changed = false;
    const lines = doc.lines.map((line) => ({
      ...line,
      words: line.words.map((word) => {
        const next = edits.get(word.id)?.trim();
        if (next === undefined || next === word.text) return word;
        changed = true;
        return { ...word, text: next };
      }),
    }));
    edits.clear();
    if (changed) setDoc({ ...doc, lines });
  }

  function seekToWord(event: MouseEvent<HTMLDivElement>) {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-word-id]");
    const start = target?.dataset.start;
    if (!doc || start === undefined) return;
    const located = engine.findClip(doc.clipId);
    if (!located) return;
    seekFrame(sourceSecondToFrame(located.clip, Number(start), fps));
  }

  function burn() {
    job.run("burn", async () => {
      if (!doc) throw new Error("Load a transcript first.");
      const located = engine.findClip(doc.clipId);
      if (!located) throw new Error("That clip is no longer on the timeline.");
      const srt = toSrt(doc.lines);
      if (!srt.trim()) throw new Error("There are no captions left to burn.");
      const blob = await requestBurnSubtitles(await fileFromClip(located.clip), srt, {
        fontSize: 48,
        position: "bottom",
        font: "Inter",
      });
      const file = new File([blob], "captioned.mp4", { type: "video/mp4" });
      // Keep the clip's trim: cuts may have split it, and restoring the full
      // source length would overlap the piece that follows.
      await swapClipMedia(engine, located, file, "video");
      toast("Captions burned into the clip");
    });
  }

  const cutCount = doc
    ? doc.lines.flatMap((line) => line.words).filter((word) => word.cut).length
    : 0;

  return (
    <PanelBody>
      {job.error && <ErrorNote text={job.error} />}

      {!doc && (
        <>
          <HintNote>
            Select a video clip and the transcript loads itself. Select words and press Delete to
            cut that moment out of the timeline.
          </HintNote>
          <label className="text-[11px] text-[#888899]">
            Spoken language
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
              disabled={job.busy !== null}
              className="mb-2 mt-1 h-8 w-full rounded-md border border-[#2a2a30] bg-[#1a1a1e] px-2 text-[12px] text-white disabled:opacity-50"
            >
              <option value="auto">Detect automatically</option>
              {SPOKEN_LANGUAGES.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <PrimaryButton onClick={() => load()} busy={job.busy === "captions"}>
            {job.busy === "captions" ? "Transcribing…" : "Load transcript"}
          </PrimaryButton>
        </>
      )}

      {doc && (
        <>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] text-[#888899]">
              {words.length} words{cutCount > 0 ? ` · ${cutCount} cut` : ""}
            </p>
            <button
              type="button"
              onClick={() => {
                loadedFor.current = null;
                setDoc(null);
              }}
              className="text-[11px] text-[#888899] transition-colors duration-150 hover:text-white"
            >
              Reset
            </button>
          </div>

          <div ref={scrollRef} className="capfree-scroll max-h-[320px] overflow-y-auto">
            {doc.lines.map((line) => {
              const kept = line.words.filter((word) => !word.cut);
              if (kept.length === 0) return null;
              const shown = words.filter((word) => kept.some((item) => item.id === word.id));
              const from = shown.length > 0 ? shown[0].displayStart : 0;
              const to = shown.length > 0 ? shown[shown.length - 1].displayEnd : 0;
              return (
                <div
                  key={`${line.id}:${revision}`}
                  className="mb-1.5 rounded-md bg-[#1e1e24] px-2 py-1.5"
                >
                  <span className="mb-0.5 block font-mono text-[9px] text-[#00d4b4]">
                    {stamp(from)} – {stamp(to)}
                  </span>
                  <div
                    contentEditable
                    suppressContentEditableWarning
                    spellCheck={false}
                    role="textbox"
                    tabIndex={0}
                    aria-label="Transcript line"
                    onKeyDown={onKeyDown}
                    onInput={captureDraft}
                    onBlur={commitDrafts}
                    onClick={seekToWord}
                    className="text-[12px] leading-relaxed text-white outline-none focus:ring-1 focus:ring-[#00d4b4]"
                  >
                    {kept.map((word) => (
                      <span
                        key={word.id}
                        data-word-id={word.id}
                        data-start={word.start}
                        className="cursor-pointer px-px"
                      >
                        {word.text}{" "}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex flex-col gap-1">
            <QuietButton onClick={() => cutWordIds(selectedWordIds())} disabled={job.busy !== null}>
              Cut selected
            </QuietButton>
            <PrimaryButton onClick={burn} busy={job.busy === "burn"} disabled={job.busy !== null}>
              {job.busy === "burn" ? "Burning…" : "Burn captions"}
            </PrimaryButton>
            <QuietButton
              onClick={() => download(toPlainText(doc.lines), "transcript.txt", "text/plain")}
            >
              Export transcript
            </QuietButton>
          </div>
          <p className="mt-2 text-[10px] leading-snug text-[#888899]">
            Burn-in renders onto the clip&apos;s source media, so it uses the original timings.
          </p>
        </>
      )}
    </PanelBody>
  );
}
