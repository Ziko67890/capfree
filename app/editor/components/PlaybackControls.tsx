"use client";

import { useRef } from "react";
import { Play, Pause, Repeat, SkipBack } from "lucide-react";
import { framesToSeconds, playbackStore, usePlaybackStore } from "@elah/editor";
import { usePreviewLook, type TimeRange } from "../previewLook";

interface PlaybackControlsProps {
  isPlaying: boolean;
  totalFrames: number;
  fps: number;
  loop: boolean;
  totalSeconds: number;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (frame: number) => void;
  onToggleLoop: () => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${m}:${String(s).padStart(2, "0")}.${ms}`;
}

/**
 * One half of the scrub bar.
 *
 * The transport sits in the middle of the row, so the bar is drawn either side
 * of it. Each half owns a contiguous half of the timeline -- the left one from
 * the first frame to the midpoint, the right one from there to the end -- which
 * keeps the two reading as a single bar: the fill crosses from one into the
 * other exactly when the playhead passes the middle.
 */
function ScrubHalf({
  from,
  to,
  current,
  fps,
  silences,
  onSeek,
  onGrab,
  onRelease,
}: {
  from: number;
  to: number;
  current: number;
  fps: number;
  silences: TimeRange[];
  onSeek: (frame: number) => void;
  onGrab: () => void;
  onRelease: () => void;
}) {
  const span = Math.max(to - from, 1);
  const percent = Math.min(100, Math.max(0, ((current - from) / span) * 100));

  /*
    Silences marked by an AI edit, clipped to this half's own range. The bar
    is drawn in two pieces either side of the transport, so a stretch that
    crosses the middle has to be split between them to stay in one line.
  */
  const bands = silences
    .map((range) => ({ start: range.start * fps, end: range.end * fps }))
    .filter((range) => range.end > from && range.start < to)
    .map((range) => {
      const left = ((Math.max(range.start, from) - from) / span) * 100;
      const right = ((Math.min(range.end, to) - from) / span) * 100;
      return { left, width: Math.max(0.5, right - left) };
    });

  return (
    <div className="group relative h-[3px] flex-1 rounded-full bg-[var(--bg-panel2)]">
      {bands.map((band, index) => (
        <div
          key={`${band.left}-${index}`}
          className="pointer-events-none absolute top-0 h-full bg-[#f59e0b]"
          style={{ left: `${band.left}%`, width: `${band.width}%` }}
          aria-hidden
        />
      ))}
      <div
        className="pointer-events-none absolute left-0 top-0 h-full rounded-full bg-white"
        style={{ width: `${percent}%` }}
      />
      <input
        type="range"
        min={from}
        max={to}
        value={Math.min(Math.max(current, from), to)}
        aria-label="Seek"
        onChange={(event) => onSeek(Number(event.target.value))}
        onPointerDown={onGrab}
        onPointerUp={onRelease}
        onPointerCancel={onRelease}
        onLostPointerCapture={onRelease}
        className="absolute inset-y-[-8px] left-0 w-full cursor-pointer opacity-0"
      />
      <div
        className="pointer-events-none absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-white opacity-0 shadow transition-opacity group-hover:opacity-100"
        style={{ left: `calc(${percent}% - 5px)` }}
      />
    </div>
  );
}

/**
 * The playhead readout and the scrub bar, split out from the controls so that
 * the frame subscription lands here. During playback this is the only part of
 * the editor React re-renders per frame; the transport button, its icon and
 * everything above stay untouched.
 */
function Transport({
  isPlaying,
  totalFrames,
  fps,
  totalSeconds,
  onPlay,
  onPause,
  onSeek,
}: {
  isPlaying: boolean;
  totalFrames: number;
  fps: number;
  totalSeconds: number;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (frame: number) => void;
}) {
  const currentFrame = usePlaybackStore((state) => state.currentFrame);
  // Silences an AI edit has marked, drawn as amber bands under the fill.
  const { silences } = usePreviewLook();
  // Frames are zero-based, so the last one with a picture is one before the
  // total. Letting the bar reach `totalFrames` parks the playhead a frame past
  // the end of the project, where there is nothing left to draw.
  const lastFrame = Math.max(totalFrames - 1, 0);
  const current = Math.min(currentFrame, lastFrame);
  const middle = Math.floor(lastFrame / 2);

  /*
    Scrubbing while the transport runs fights it: each change seeks the engine,
    which re-anchors and keeps integrating from there, so the thumb runs away
    from the pointer between events. The timeline's own needle handles this by
    pausing for the length of the drag and resuming after, so this bar does the
    same and the two scrubbers behave alike.

    Both pointerup and lostpointercapture resume, because a slider dragged off
    the window ends the gesture with whichever of the two the browser sends;
    the flag makes the second one a no-op.
  */
  const resume = useRef(false);

  function grab() {
    const playback = playbackStore.getState();
    resume.current = playback.isPlaying;
    if (playback.isPlaying) playback.pause();
  }

  function release() {
    if (!resume.current) return;
    resume.current = false;
    playbackStore.getState().play();
  }

  return (
    <>
      <span className="w-[52px] shrink-0 font-mono text-[11px] text-[var(--text-muted)]">
        {formatTime(framesToSeconds(current, fps))}
      </span>

      <ScrubHalf
        from={0}
        to={middle}
        current={current}
        fps={fps}
        silences={silences}
        onSeek={onSeek}
        onGrab={grab}
        onRelease={release}
      />

      <button
        onClick={isPlaying ? onPause : onPlay}
        aria-label={isPlaying ? "Pause" : "Play"}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-black transition-colors hover:bg-[#e6e6e6]"
      >
        {isPlaying ? (
          <Pause className="h-4 w-4" fill="currentColor" />
        ) : (
          <Play className="h-4 w-4 translate-x-px" fill="currentColor" />
        )}
      </button>

      <ScrubHalf
        from={middle}
        to={lastFrame}
        current={current}
        fps={fps}
        silences={silences}
        onSeek={onSeek}
        onGrab={grab}
        onRelease={release}
      />

      <span className="w-[52px] shrink-0 text-right font-mono text-[11px] text-[var(--text-muted)]">
        {formatTime(totalSeconds)}
      </span>
    </>
  );
}

export function PlaybackControls({
  isPlaying,
  totalFrames,
  fps,
  loop,
  totalSeconds,
  onPlay,
  onPause,
  onSeek,
  onToggleLoop,
}: PlaybackControlsProps) {
  /*
    Rewind and loop sit outside the timecodes rather than in the middle of the
    row. The centre is the transport, as designed, but neither control has
    anywhere else to live -- loop is not in the Inspector or the timeline bar
    -- and dropping them would take working features off the screen.
  */
  return (
    <div className="flex w-full max-w-3xl items-center gap-3">
      <button
        onClick={() => onSeek(0)}
        aria-label="Return to start"
        title="Return to start"
        className="shrink-0 text-[var(--text-muted)] transition-colors hover:text-white"
      >
        <SkipBack className="h-4 w-4" />
      </button>

      <Transport
        isPlaying={isPlaying}
        totalFrames={totalFrames}
        fps={fps}
        totalSeconds={totalSeconds}
        onPlay={onPlay}
        onPause={onPause}
        onSeek={onSeek}
      />

      <button
        onClick={onToggleLoop}
        aria-label="Toggle loop"
        title="Loop"
        className={`shrink-0 transition-colors ${
          loop ? "text-[var(--accent)]" : "text-[var(--text-muted)] hover:text-white"
        }`}
      >
        <Repeat className="h-4 w-4" />
      </button>
    </div>
  );
}
