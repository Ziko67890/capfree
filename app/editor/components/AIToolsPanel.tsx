"use client";

import { useRef, useState } from "react";
import { AudioLines, Eraser, Loader2, Music2, Scissors, type LucideIcon } from "lucide-react";
import { importBlob, useTimelineEngine } from "@elah/editor";
import { requestBackgroundRemoval, requestBeatSync, requestSilenceRemoval } from "../api";
import {
  fileFromClip,
  replaceClipFile,
  selectedImageClip,
  selectedVisualClips,
  targetVideoClip,
} from "../timelineMedia";

/** Captions and vocal isolation live in their own panels, not here. */
type ToolId = "silence" | "removebg" | "beats";

interface AIToolsPanelProps {
  fps: number;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function AIToolsPanel({ fps }: AIToolsPanelProps) {
  const engine = useTimelineEngine();
  const musicInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<ToolId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [music, setMusic] = useState<File | null>(null);

  async function run(id: ToolId, task: () => Promise<void>) {
    if (busy) return;
    setBusy(id);
    setError(null);
    try {
      await task();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  async function removeSilence() {
    const located = targetVideoClip(engine);
    if (!located) throw new Error("Add a video to the timeline first.");
    const blob = await requestSilenceRemoval(await fileFromClip(located.clip));
    const file = new File([blob], "trimmed.mp4", { type: "video/mp4" });
    await replaceClipFile(engine, located, file, "video", fps);
  }

  async function removeBackground() {
    const located = selectedImageClip(engine);
    if (!located) throw new Error("Select an image clip first.");
    const blob = await requestBackgroundRemoval(await fileFromClip(located.clip));
    const file = new File([blob], "nobg.png", { type: "image/png" });
    await replaceClipFile(engine, located, file, "image", fps);
  }

  async function beatSync() {
    if (!music) throw new Error("Choose a music file first.");
    const clips = selectedVisualClips(engine);
    if (clips.length === 0) throw new Error("Select one or more video or image clips.");
    if (clips.length > 20) throw new Error("Beat sync accepts at most 20 clips.");

    const files = await Promise.all(clips.map((hit) => fileFromClip(hit.clip)));
    const blob = await requestBeatSync(music, files);
    const file = new File([blob], "beatsync.mp4", { type: "video/mp4" });
    downloadBlob(file, file.name);

    const asset = await importBlob(file, { name: file.name, kind: "video" });
    const project = engine.getProject();
    const track =
      project.tracks.find((item) => item.kind === "video") ??
      engine.addTrack("video", { name: "Video" });
    engine.addClip({
      trackId: track.id,
      type: "video",
      src: asset.src,
      assetId: asset.id,
      name: "Beat sync",
      startFrame: engine.getTotalFrames(),
      durationFrames: Math.max(1, Math.round(asset.durationSec * fps)),
    });
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
            const file = event.target.files?.[0] ?? null;
            setMusic(file);
            setError(null);
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
          <span className="truncate">{music ? music.name : "Choose music"}</span>
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
      </div>

      {error && (
        <p role="alert" className="text-[11px] leading-snug text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
