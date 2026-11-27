"use client";

import { useState } from "react";
import { ClipboardPaste, Copy, Gauge, Redo2, Scissors, Trash2, Undo2, Volume2, ZoomIn, ZoomOut } from "lucide-react";
import {
  clampZoom,
  framesToTimecode,
  playbackStore,
  splitClipAtPlayhead,
  usePlaybackStore,
  useTimelineEngine,
  useTracksStore,
  ZOOM_MAX,
  ZOOM_MIN,
} from "@elah/editor";
import {
  copySelection,
  deleteSelection,
  pasteSelection,
  selectedClips,
  SPLIT_MESSAGE,
} from "../clipEdit";
import { playheadFrame } from "../captionActions";
import { useSelectedClip } from "../useSelectedClip";

interface TimelineBarProps {
  fps: number;
}

/**
 * Its own component so the frame subscription stops here. Read into the bar
 * itself, the advancing playhead re-rendered this whole row -- ten buttons and
 * their icons -- on every frame of playback.
 */
function Timecode({ fps }: { fps: number }) {
  const currentFrame = usePlaybackStore((state) => state.currentFrame);
  return <span className="font-mono text-[12px] text-white">{framesToTimecode(currentFrame, fps)}</span>;
}

export function TimelineBar({ fps }: TimelineBarProps) {
  const engine = useTimelineEngine();
  const zoom = usePlaybackStore((state) => state.zoom);
  const canUndo = useTracksStore((state) => state.canUndo);
  const canRedo = useTracksStore((state) => state.canRedo);
  const selected = useSelectedClip();
  const [message, setMessage] = useState<string | null>(null);
  const [open, setOpen] = useState<"speed" | "volume" | null>(null);
  const [speed, setSpeed] = useState(1);
  const [volume, setVolume] = useState(100);
  const [sliderSource, setSliderSource] = useState("");

  // What the clip actually carries. Speed is stored signed -- a reversed clip
  // reads negative -- and the slider only covers forward rates, so the
  // magnitude is what it shows.
  const clipSpeed = Math.abs(selected?.clip.speed ?? 1);
  const clipVolume = Math.round((selected?.clip.volume ?? 1) * 100);

  // Re-seed both sliders from the selection, so opening either popover shows
  // the current clip's real value rather than a hardcoded 1x / 100%. Keyed on
  // the committed values too, so an undo or an edit made elsewhere pulls the
  // sliders back in step. Adjusting state during render, as the Inspector does
  // for its own fields, avoids an effect's extra commit and a stale first paint.
  //
  // Dragging volume previews onto the clip, which moves clipVolume as well --
  // but to the same whole percent the slider is already showing, so the re-seed
  // is a no-op mid-drag rather than a fight with the pointer.
  const sliderKey = `${selected?.clip.id ?? ""}:${clipSpeed}:${clipVolume}`;
  if (sliderSource !== sliderKey) {
    setSliderSource(sliderKey);
    setSpeed(clipSpeed);
    setVolume(clipVolume);
  }

  function report(text: string | null) {
    setMessage(text);
  }

  function split() {
    setOpen(null);
    const result = splitClipAtPlayhead(engine);
    report(result.ok ? null : (SPLIT_MESSAGE[result.reason] ?? "Could not split this clip."));
  }

  function previewVolume(next: number) {
    const media = selectedClips(engine).filter((hit) => hit.clip.type === "video" || hit.clip.type === "audio");
    if (media.length === 0) {
      report("Select a video or audio clip to change volume.");
      return;
    }
    for (const hit of media) engine.previewClip(hit.clip.id, hit.trackId, { volume: next / 100 });
    report(null);
  }

  const buttonClass =
    "flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-[var(--text-muted)] transition-colors duration-150 hover:bg-[var(--bg-panel)] hover:text-white disabled:opacity-40";

  return (
    <div className="relative flex h-9 shrink-0 items-center border-b border-[var(--border)] bg-[var(--bg-panel2)] px-2">
      <div className="flex items-center gap-0.5">
        <button type="button" className={buttonClass} onClick={split}>
          <Scissors className="h-3.5 w-3.5" />
          Split
        </button>
        <button
          type="button"
          className={buttonClass}
          onClick={() => {
            setOpen(null);
            report(deleteSelection(engine));
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </button>
        <button
          type="button"
          className={buttonClass}
          onClick={() => setOpen((current) => (current === "speed" ? null : "speed"))}
        >
          <Gauge className="h-3.5 w-3.5" />
          Speed
        </button>
        <button
          type="button"
          className={buttonClass}
          onClick={() => setOpen((current) => (current === "volume" ? null : "volume"))}
        >
          <Volume2 className="h-3.5 w-3.5" />
          Volume
        </button>
        <button
          type="button"
          className={buttonClass}
          onClick={() => {
            setOpen(null);
            report(copySelection(engine));
          }}
        >
          <Copy className="h-3.5 w-3.5" />
          Copy
        </button>
        <button
          type="button"
          className={buttonClass}
          onClick={() => {
            setOpen(null);
            report(pasteSelection(engine, playheadFrame()));
          }}
        >
          <ClipboardPaste className="h-3.5 w-3.5" />
          Paste
        </button>
        <button type="button" className={buttonClass} disabled={!canUndo} onClick={() => engine.undo()}>
          <Undo2 className="h-3.5 w-3.5" />
          Undo
        </button>
        <button type="button" className={buttonClass} disabled={!canRedo} onClick={() => engine.redo()}>
          <Redo2 className="h-3.5 w-3.5" />
          Redo
        </button>
      </div>
      <div className="ml-auto flex items-center">
        <button
          type="button"
          aria-label="Zoom out"
          className={buttonClass}
          disabled={zoom <= ZOOM_MIN}
          onClick={() => playbackStore.getState().setZoom(clampZoom(zoom / 1.25))}
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="Zoom in"
          className={buttonClass}
          disabled={zoom >= ZOOM_MAX}
          onClick={() => playbackStore.getState().setZoom(clampZoom(zoom * 1.25))}
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <Timecode fps={fps} />
      </div>

      {message && (
        <p role="alert" className="absolute right-2 max-w-[220px] truncate text-[11px] text-red-400">
          {message}
        </p>
      )}

      {open && (
        <div className="absolute bottom-full left-2 z-20 mb-1 w-56 rounded-lg border border-[var(--border)] bg-[var(--bg-panel2)] p-3 shadow-lg">
          {open === "speed" ? (
            <label className="flex flex-col gap-1 text-[11px] text-[var(--text-muted)]">
              <span className="flex justify-between">
                Speed <span className="font-mono">{speed.toFixed(2)}x</span>
              </span>
              <input
                type="range"
                min={0.25}
                max={4}
                step={0.05}
                value={speed}
                aria-label="Clip speed"
                onChange={(event) => setSpeed(Number(event.target.value))}
                onPointerUp={(event) => {
                  const next = Number(event.currentTarget.value);
                  setSpeed(next);
                  const videos = selectedClips(engine).filter((hit) => hit.clip.type === "video");
                  if (videos.length === 0) {
                    report("Select a video clip to change speed.");
                    return;
                  }
                  for (const hit of videos) engine.setClipSpeed(hit.clip.id, hit.trackId, next);
                  report(null);
                }}
                className="w-full accent-[var(--accent)]"
              />
            </label>
          ) : (
            <label className="flex flex-col gap-1 text-[11px] text-[var(--text-muted)]">
              <span className="flex justify-between">
                Volume <span className="font-mono">{volume}%</span>
              </span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={volume}
                aria-label="Clip volume"
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setVolume(next);
                  previewVolume(next);
                }}
                onPointerUp={() => engine.commitInteraction("Volume")}
                className="w-full accent-[var(--accent)]"
              />
            </label>
          )}
        </div>
      )}
    </div>
  );
}
