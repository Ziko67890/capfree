"use client";

import { useRef } from "react";
import { Play, Pause, SkipBack, Repeat } from "lucide-react";
import { framesToSeconds, playbackStore, usePlaybackStore } from "@elah/editor";

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
 * The playhead readout and the scrub bar, split out from the controls so that
 * the frame subscription lands here. During playback this is the only part of
 * the editor React re-renders per frame; the transport buttons, their icons and
 * everything above them stay untouched.
 */
function Scrubber({
  totalFrames,
  fps,
  onSeek,
}: {
  totalFrames: number;
  fps: number;
  onSeek: (frame: number) => void;
}) {
  const currentFrame = usePlaybackStore((state) => state.currentFrame);
  // Frames are zero-based, so the last one with a picture is one before the
  // total. Letting the bar reach `totalFrames` parks the playhead a frame past
  // the end of the project, where there is nothing left to draw.
  const lastFrame = Math.max(totalFrames - 1, 0);
  const percent = lastFrame > 0 ? (Math.min(currentFrame, lastFrame) / lastFrame) * 100 : 0;

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

  function beginScrub() {
    const playback = playbackStore.getState();
    resume.current = playback.isPlaying;
    if (playback.isPlaying) playback.pause();
  }

  function endScrub() {
    if (!resume.current) return;
    resume.current = false;
    playbackStore.getState().play();
  }

  return (
    <>
      {/* Timecode */}
      <span className="text-xs font-mono text-[#888] flex-shrink-0 w-[76px]">
        {formatTime(framesToSeconds(currentFrame, fps))}
      </span>

      {/* Scrub bar */}
      <div className="flex-1 relative h-1.5 bg-[#2a2a2e] rounded-full cursor-pointer group">
        {/* Progress fill */}
        <div
          className="absolute left-0 top-0 h-full bg-[#ffffff] rounded-full pointer-events-none"
          style={{ width: `${percent}%` }}
        />
        {/* Invisible range input for interaction */}
        <input
          type="range"
          min={0}
          max={Math.max(lastFrame, 1)}
          value={Math.min(currentFrame, lastFrame)}
          aria-label="Seek"
          onChange={(e) => onSeek(Number(e.target.value))}
          onPointerDown={beginScrub}
          onPointerUp={endScrub}
          onPointerCancel={endScrub}
          onLostPointerCapture={endScrub}
          className="absolute inset-0 w-full opacity-0 cursor-pointer"
        />
        {/* Thumb */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ left: `calc(${percent}% - 6px)` }}
        />
      </div>
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
  return (
    <div className="flex items-center gap-3 w-full max-w-xl">
      {/* Return to start */}
      <button
        onClick={() => onSeek(0)}
        aria-label="Return to start"
        className="text-[#888] hover:text-white transition-colors"
      >
        <SkipBack className="w-4 h-4" />
      </button>

      {/* Play / Pause */}
      <button
        onClick={isPlaying ? onPause : onPlay}
        aria-label={isPlaying ? "Pause" : "Play"}
        className="w-9 h-9 rounded-full bg-[#ffffff] flex items-center justify-center text-black hover:bg-[#e6e6e6] transition-colors flex-shrink-0"
      >
        {isPlaying ? (
          <Pause className="w-4 h-4" fill="currentColor" />
        ) : (
          <Play className="w-4 h-4 translate-x-[1px]" fill="currentColor" />
        )}
      </button>

      {/* Loop toggle */}
      <button
        onClick={onToggleLoop}
        aria-label="Toggle loop"
        className={`transition-colors ${loop ? "text-[#ffffff]" : "text-[#888] hover:text-white"}`}
      >
        <Repeat className="w-4 h-4" />
      </button>

      <Scrubber totalFrames={totalFrames} fps={fps} onSeek={onSeek} />

      {/* Total duration */}
      <span className="text-xs font-mono text-[#555] flex-shrink-0 w-[60px] text-right">
        {formatTime(totalSeconds)}
      </span>
    </div>
  );
}
