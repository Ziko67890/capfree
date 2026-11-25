"use client";

import { useRef, useState } from "react";
import { AudioLines, Eraser, Loader2, Music2, Scissors, type LucideIcon } from "lucide-react";
import { useTimelineEngine } from "@elah/editor";
import { requestBackgroundRemoval, requestBeats, requestSilenceDetect } from "../api";
import { cutSourceRanges, snapCutsToBeats, withCompanions } from "../timelineCuts";
import { fileFromClip, replaceClipFile, selectedImageClip, targetVideoClip } from "../timelineMedia";
import { useToast } from "./toast";

/** Captions and vocal isolation live in their own panels, not here. */
type ToolId = "silence" | "removebg" | "beats";

interface AIToolsPanelProps {
  fps: number;
}

/** How much a clip may lose to reach a beat when the tempo came back unknown. */
const FALLBACK_TRIM_FRAMES = 15;

export function AIToolsPanel({ fps }: AIToolsPanelProps) {
  const engine = useTimelineEngine();
  const toast = useToast();
  const musicInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<ToolId | null>(null);
  const [music, setMusic] = useState<File | null>(null);

  /**
   * One job at a time; the task says what to report on success and throws with
   * what to report on failure. Everything here is awaited network work plus a
   * short engine edit, so the frame loop keeps running throughout.
   */
  async function run(id: ToolId, task: () => Promise<string>) {
    if (busy) return;
    setBusy(id);
    try {
      toast(await task());
    } catch (err) {
      toast(err instanceof Error ? err.message : "Something went wrong", "error");
    } finally {
      setBusy(null);
    }
  }

  /**
   * Detect, then cut on the timeline. /silence/remove would re-encode the file
   * and hand back a new one, which costs a round trip of the whole video and
   * replaces the clip's media; cutting the ranges here is instant and undoable.
   */
  async function removeSilence(): Promise<string> {
    const located = targetVideoClip(engine);
    if (!located) throw new Error("Add a video to the timeline first.");
    const found = await requestSilenceDetect(await fileFromClip(located.clip));
    if (found.silences.length === 0) {
      return "No silences long enough to cut — the clip is unchanged.";
    }
    const result = cutSourceRanges(
      engine,
      withCompanions(engine, located),
      found.silences,
      fps,
      "Remove silences",
    );
    if (result.cuts === 0) throw new Error("The silences fall outside this clip's trim.");
    return `Cut ${result.cuts} silence${result.cuts === 1 ? "" : "s"} — ${result.secondsRemoved.toFixed(1)}s removed`;
  }

  async function removeBackground(): Promise<string> {
    const located = selectedImageClip(engine);
    if (!located) throw new Error("Select an image clip first.");
    const blob = await requestBackgroundRemoval(await fileFromClip(located.clip));
    const file = new File([blob], "nobg.png", { type: "image/png" });
    await replaceClipFile(engine, located, file, "image", fps);
    return "Background removed";
  }

  /**
   * Asks the API where the beats are, then moves the cuts between neighbouring
   * clips onto them. The music file is used when one is chosen, since that is
   * what the edit is meant to sit against; failing that the clip's own audio
   * carries the tempo.
   */
  async function beatSync(): Promise<string> {
    const located = targetVideoClip(engine);
    if (!located) throw new Error("Add clips to the timeline first.");

    const source = music ?? (await fileFromClip(located.clip));
    const { bpm, beats } = await requestBeats(source);
    if (beats.length === 0) throw new Error("No beats found in that audio.");

    // A cut can only move back to the beat before it, which is at most one
    // beat away — so that is the most a clip is allowed to give up. Any less
    // and cuts that fall late in a bar could not reach a beat at all.
    const maxTrim = bpm > 0 ? Math.max(2, Math.round((60 / bpm) * fps)) : FALLBACK_TRIM_FRAMES;
    // The picture's audio twin, if it has one, is trimmed alongside it.
    const tracks = [...new Set(withCompanions(engine, located).map((target) => target.trackId))];
    const result = snapCutsToBeats(engine, tracks, beats, fps, maxTrim);

    if (result.candidates === 0) {
      throw new Error("Beat sync needs two clips in a row — there is no cut to snap yet.");
    }
    if (result.snapped === 0) {
      return `${bpm} BPM — no cut was close enough to a beat to move.`;
    }
    return `${result.snapped} of ${result.candidates} cut${result.candidates === 1 ? "" : "s"} snapped to ${bpm} BPM`;
  }

  const tools: Array<{ id: ToolId; label: string; icon: LucideIcon; onClick: () => void }> = [
    { id: "silence", label: "Remove Silence", icon: AudioLines, onClick: () => void run("silence", removeSilence) },
    { id: "removebg", label: "Remove Background", icon: Eraser, onClick: () => void run("removebg", removeBackground) },
  ];

  return (
    <div className="flex flex-col gap-2 h-full min-h-0 overflow-y-auto p-3">
      <div>
        <h2 className="text-[12px] font-semibold text-white">AI Tools</h2>
        <p className="mt-1 text-[10px] leading-snug text-[#888]">
          Silence trimming, background removal, and beat sync run on the local API.
        </p>
      </div>

      {tools.map((tool) => {
        const Icon = tool.icon;
        const spinning = busy === tool.id;
        return (
          <button
            key={tool.id}
            type="button"
            onClick={tool.onClick}
            disabled={busy !== null}
            className="flex items-center gap-2 w-full px-2.5 py-2 rounded-md bg-[#1c1c1f] border border-[#2a2a2e] text-left text-[12px] text-white hover:border-[#ffffff] disabled:opacity-50 disabled:hover:border-[#2a2a2e] transition-colors"
          >
            {spinning ? (
              <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin text-[#ffffff]" />
            ) : (
              <Icon className="w-3.5 h-3.5 shrink-0 text-[#ffffff]" />
            )}
            {tool.label}
          </button>
        );
      })}

      <div className="mt-1 flex flex-col gap-2">
        <input
          ref={musicInputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(event) => {
            setMusic(event.target.files?.[0] ?? null);
            event.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => musicInputRef.current?.click()}
          disabled={busy !== null}
          className="flex items-center gap-2 w-full px-2.5 py-2 rounded-md bg-[#1c1c1f] border border-[#2a2a2e] text-left text-[12px] text-white hover:border-[#ffffff] disabled:opacity-50 transition-colors"
        >
          <Music2 className="w-3.5 h-3.5 shrink-0 text-[#ffffff]" />
          <span className="truncate">{music ? music.name : "Choose music (optional)"}</span>
        </button>
        <button
          type="button"
          onClick={() => void run("beats", beatSync)}
          disabled={busy !== null}
          className="flex items-center gap-2 w-full px-2.5 py-2 rounded-md bg-[#1c1c1f] border border-[#2a2a2e] text-left text-[12px] text-white hover:border-[#ffffff] disabled:opacity-50 disabled:hover:border-[#2a2a2e] transition-colors"
        >
          {busy === "beats" ? (
            <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin text-[#ffffff]" />
          ) : (
            <Scissors className="w-3.5 h-3.5 shrink-0 text-[#ffffff]" />
          )}
          Beat Sync
        </button>
        <p className="text-[10px] leading-snug text-[#888]">
          Trims each clip back to the beat of the chosen music, or of the clip&rsquo;s own audio, so
          every cut lands on one. Needs two clips in a row.
        </p>
      </div>
    </div>
  );
}
