"use client";

import { useRef, useState } from "react";
import { ArrowRight, Sparkles, X } from "lucide-react";
import { framesToSeconds, useTimelineEngine, useTracks } from "@elah/editor";
import { addMoodMusic, removeSilences, trimToSeconds } from "../aiActions";
import { resolvePrompt } from "../aiPrompt";
import { Spinner } from "./chrome";
import { useToast } from "./toast";

interface PromptBarProps {
  fps: number;
}

const PLACEHOLDER =
  "Tell Claude what to edit... e.g. 'remove all silences' or 'add chill music'";

export function PromptBar({ fps }: PromptBarProps) {
  const engine = useTimelineEngine();
  const tracks = useTracks();
  const toast = useToast();

  const abortRef = useRef<AbortController | null>(null);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  // Only known once the API has answered, so it stays hidden until then.
  const [remaining, setRemaining] = useState<number | null>(null);

  function cancel() {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    setStatus(null);
  }

  async function run() {
    const text = prompt.trim();
    if (!text || busy) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setStatus("Asking Claude…");

    try {
      const { action, remaining: left } = await resolvePrompt(
        text,
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
    <div className="flex h-10 shrink-0 items-center gap-2 border-t border-[#2a2a30] bg-[#141418] px-3">
      <Sparkles className="h-3.5 w-3.5 shrink-0 text-[#888899]" aria-hidden />
      {remaining !== null && !busy && (
        <span
          className="shrink-0 text-[10px] text-[#888899]"
          title="Free AI edits left today"
        >
          {remaining} left
        </span>
      )}
      <input
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") void run();
        }}
        placeholder={PLACEHOLDER}
        aria-label="Tell Claude what to edit"
        disabled={busy}
        className="h-7 min-w-0 flex-1 rounded-md border border-[#2a2a30] bg-[#1a1a1e] px-2 text-[12px] text-white outline-none transition-colors placeholder:text-[#888899] focus:border-[#ffffff] disabled:opacity-60"
      />

      {status && (
        <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-[#c8c8ce]">
          <Spinner />
          {status}
        </span>
      )}

      {busy ? (
        <button
          type="button"
          onClick={cancel}
          className="flex h-7 shrink-0 items-center gap-1 rounded-md border border-[#3a3a42] px-2 text-[11px] text-[#c8c8ce] transition-colors hover:border-[#ffffff] hover:text-white"
        >
          <X className="h-3 w-3" />
          Cancel
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void run()}
          disabled={!prompt.trim()}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-[#ffffff] text-black transition-colors hover:bg-[#e6e6e6] disabled:opacity-40"
          aria-label="Send to Claude"
        >
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
