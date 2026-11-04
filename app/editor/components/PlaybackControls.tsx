"use client";

import { Play, Pause, SkipBack, Repeat } from "lucide-react";
import { framesToSeconds } from "@elah/editor";

interface PlaybackControlsProps {
  isPlaying: boolean;
  currentFrame: number;
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

export function PlaybackControls({
  isPlaying,
  currentFrame,
  totalFrames,
  fps,
  loop,
  totalSeconds,
  onPlay,
  onPause,
  onSeek,
  onToggleLoop,
}: PlaybackControlsProps) {
  const currentSeconds = framesToSeconds(currentFrame, fps);

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

      {/* Timecode */}
      <span className="text-xs font-mono text-[#888] flex-shrink-0 w-[76px]">
        {formatTime(currentSeconds)}
      </span>

      {/* Scrub bar */}
      <div className="flex-1 relative h-1.5 bg-[#2a2a2e] rounded-full cursor-pointer group">
        {/* Progress fill */}
        <div
          className="absolute left-0 top-0 h-full bg-[#ffffff] rounded-full pointer-events-none"
          style={{ width: totalFrames > 0 ? `${(currentFrame / totalFrames) * 100}%` : "0%" }}
        />
        {/* Invisible range input for interaction */}
        <input
          type="range"
          min={0}
          max={Math.max(totalFrames, 1)}
          value={currentFrame}
          aria-label="Seek"
          onChange={(e) => onSeek(Number(e.target.value))}
          className="absolute inset-0 w-full opacity-0 cursor-pointer"
        />
        {/* Thumb */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ left: totalFrames > 0 ? `calc(${(currentFrame / totalFrames) * 100}% - 6px)` : "-6px" }}
        />
      </div>

      {/* Total duration */}
      <span className="text-xs font-mono text-[#555] flex-shrink-0 w-[60px] text-right">
        {formatTime(totalSeconds)}
      </span>
    </div>
  );
}
