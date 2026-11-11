"use client";

import { useRef, useState } from "react";
import { ArrowRight, Sparkles, X } from "lucide-react";
import { framesToSeconds, useTimelineEngine, useTracks } from "@elah/editor";
import { addMoodMusic, removeSilences, trimToSeconds } from "../../aiActions";
import { resolvePrompt } from "../../aiPrompt";
import { EmptyNote, PanelBody, Spinner } from "../chrome";
import { useToast } from "../toast";

interface AiPanelProps {
  fps: number;
}

const PLACEHOLDER =
  "Tell Claude what to edit... e.g. 'remove all silences' or 'add chill music'";

/** One tap each, so the panel is usable without typing. */
const EXAMPLES = [
  "Remove all silences",
  "Add chill music",
  "Make it 30 seconds",
] as const;

export function AiPanel({ fps }: AiPanelProps) {
  const engine = useTimelineEngine();
  const tracks = useTracks();
  const toast = useToast();

  const abortRef = useRef<AbortController | null>(null);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  // Only known once the API has answered, so it stays hidden until then.
  const [remaining, setRemaining] = useState<number | null>(null);
  const [history, setHistory] = useState<string[]>([]);

  function cancel() {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    setStatus(null);
  }

  async function run(text: string) {
    const ask = text.trim();
    if (!ask || busy) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setStatus("Asking Claude…");

    try {
      const { action, remaining: left } = await resolvePrompt(
        ask,
        {
          durationSeconds: framesToSeconds(tracks.totalFrames, fps),
          clipCount: Object.values(engine.getProject().clips).reduce(
            (total, list) => total + list.length,
            0,
          ),
        },
        controller.signal,
      );
      setRemaining(left);

      if (action.kind === "reply") {
        setStatus(null);
        toast(action.text, "error");
        return;
      }

      // The model named an action; from here the editor does the work.
      let outcome;
      if (action.kind === "remove_silences") {
        setStatus("Finding silences…");
        outcome = await removeSilences(engine, fps);
      } else if (action.kind === "add_music") {
        setStatus(`Looking for ${action.mood} music…`);
        outcome = await addMoodMusic(engine, action.mood);
      } else {
        setStatus(`Trimming to ${action.seconds}s…`);
        outcome = trimToSeconds(engine, fps, action.seconds);
      }

      setPrompt("");
      setStatus(null);
      setHistory((past) => [outcome.message, ...past].slice(0, 5));
      toast(outcome.message);
    } catch (err) {
      setStatus(null);
      if (err instanceof DOMException && err.name === "AbortError") return;
      toast(err instanceof Error ? err.message : "That prompt did not work.", "error");
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  return (
    <PanelBody>
      <h2 className="flex items-center gap-1.5 text-[13px] font-semibold text-white">
        <Sparkles className="h-3.5 w-3.5" aria-hidden />
        AI
      </h2>
      <p className="mt-0.5 text-[10px] leading-snug text-[#888899]">
        Describe an edit in plain words. Five free edits a day.
        {remaining !== null && <span className="text-[#c8c8ce]"> {remaining} left today.</span>}
      </p>

      <form
        className="mt-2"
        onSubmit={(event) => {
          event.preventDefault();
          void run(prompt);
        }}
      >
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends; Shift+Enter is a newline, as in any chat box.
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void run(prompt);
            }
          }}
          placeholder={PLACEHOLDER}
          aria-label="Tell Claude what to edit"
          rows={3}
          disabled={busy}
          className="w-full resize-none rounded-md border border-[#2a2a30] bg-[#1a1a1e] px-2 py-1.5 text-[12px] leading-snug text-white outline-none transition-colors placeholder:text-[#888899] focus:border-[#ffffff] disabled:opacity-60"
        />

        {busy ? (
          <div className="mt-1.5 flex flex-col gap-1.5">
            <span className="flex items-center gap-1.5 text-[11px] text-[#c8c8ce]">
              <Spinner />
              {status ?? "Working…"}
            </span>
            <button
              type="button"
              onClick={cancel}
              className="flex h-8 w-full items-center justify-center gap-1 rounded-md border border-[#3a3a42] text-[11px] text-[#c8c8ce] transition-colors hover:border-[#ffffff] hover:text-white"
            >
              <X className="h-3 w-3" />
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="submit"
            disabled={!prompt.trim()}
            className="mt-1.5 flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-[#ffffff] text-[12px] font-semibold text-black transition-colors hover:bg-[#e6e6e6] disabled:opacity-40"
          >
            Send
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </form>

      <p className="mb-1 mt-3 text-[11px] text-[#888899]">Try</p>
      <div className="flex flex-col gap-1">
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            disabled={busy}
            onClick={() => {
              setPrompt(example);
              void run(example);
            }}
            className="rounded-md border border-[#2a2a30] bg-[#1a1a1e] px-2 py-1.5 text-left text-[11px] text-[#c8c8ce] transition-colors hover:border-[#ffffff] hover:text-white disabled:opacity-40"
          >
            {example}
          </button>
        ))}
      </div>

      <p className="mb-1 mt-3 text-[11px] text-[#888899]">Recent</p>
      {history.length === 0 ? (
        <EmptyNote text="Nothing yet — your edits will be listed here." />
      ) : (
        <ul className="flex flex-col gap-1">
          {history.map((entry, index) => (
            <li
              key={`${index}:${entry}`}
              className="rounded-md bg-[#1a1a1e] px-2 py-1.5 text-[10px] leading-snug text-[#c8c8ce]"
            >
              {entry}
            </li>
          ))}
        </ul>
      )}
    </PanelBody>
  );
}
