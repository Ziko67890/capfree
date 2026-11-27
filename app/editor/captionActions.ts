import type { CaptionLine } from "./api";
import { requestCaptions } from "./api";
import { selectedClips } from "./clipEdit";
import { fileFromClip, targetVideoClip } from "./timelineMedia";
import { playbackStore, type Clip, type TimelineEngine } from "@elah/editor";

export interface CaptionSource {
  clip: Clip;
  trackId: string;
}

interface TextStyle {
  fontSize: number;
  color: string;
  fontFamily: string;
  fontWeight: "bold" | "normal";
}

const captionIds = new Set<string>();

export function captionSource(engine: TimelineEngine): { source: CaptionSource } | { error: string } {
  const selected = selectedClips(engine);
  if (selected.length > 0) {
    const video = selected.find((hit) => hit.clip.type === "video" && (hit.clip.src || hit.clip.assetId));
    if (!video) return { error: "Select a video clip." };
    return { source: video };
  }
  const video = targetVideoClip(engine);
  if (!video) return { error: "Add a video to the timeline first." };
  return { source: video };
}

export async function fetchCaptions(engine: TimelineEngine, language?: string) {
  const picked = captionSource(engine);
  if ("error" in picked) throw new Error(picked.error);
  const file = await fileFromClip(picked.source.clip);
  const response = await requestCaptions(file, language);
  const offsetFrames = picked.source.clip.startFrame - (picked.source.clip.sourceStartFrame ?? 0);
  return { response, offsetFrames, source: picked.source, file };
}

function captionTrack(engine: TimelineEngine, name: string): string {
  const existing = engine.getProject().tracks.find((track) => track.kind === "elements" && track.name === name);
  if (existing) return existing.id;
  return engine.addTrack("elements", { name }).id;
}

export interface CaptionPlacement {
  trackName?: string;
  /** An existing track to place on, instead of looking one up by name. */
  trackId?: string;
  y?: number;
}

/** The one place a caption clip is built, so every caller lays them out alike. */
function addCaptionClip(
  engine: TimelineEngine,
  trackId: string,
  text: string,
  startFrame: number,
  durationFrames: number,
  style: TextStyle,
  y: number,
): Clip {
  const clip = engine.addClip({
    trackId,
    type: "text",
    name: text.slice(0, 48) || "Caption",
    startFrame,
    durationFrames,
    text: {
      content: text,
      fontSize: style.fontSize,
      color: style.color,
      fontFamily: style.fontFamily,
      fontWeight: style.fontWeight,
      textAlign: "center",
    },
    transform: {
      x: 0.5,
      y,
      scale: 1,
      rotation: 0,
      anchor: { x: 0.5, y: 0.5 },
    },
  });
  captionIds.add(clip.id);
  return clip;
}

export function placeTimedCaption(
  engine: TimelineEngine,
  fps: number,
  line: Pick<CaptionLine, "start" | "end" | "text">,
  offsetFrames: number,
  style: TextStyle,
  options?: CaptionPlacement,
): Clip {
  const trackId = options?.trackId ?? captionTrack(engine, options?.trackName ?? "Captions");
  const durationSec = Math.max(0.35, line.end - line.start);
  return addCaptionClip(
    engine,
    trackId,
    line.text,
    Math.max(0, offsetFrames + Math.round(line.start * fps)),
    Math.max(1, Math.round(durationSec * fps)),
    style,
    options?.y ?? 0.86,
  );
}

/**
 * A whole transcript laid down at once, which is the only way to lay one down
 * safely.
 *
 * Placing captions one at a time cannot work, because a transcript's segments
 * touch: Whisper ends a line at 7.08s and starts the next at the same 7.08s.
 * Rounding each line's start and duration on its own then produces clips that
 * overlap -- 7.08s rounds to frame 213 as a duration but to 212 as a start --
 * and `addClip` refuses an overlap, so one bad pair throws away the rest of
 * the batch.
 *
 * So every timestamp is converted to frames first and each clip is then given
 * whatever room is left before the next one begins: its last frame is the one
 * before the next clip's first. That is a cap, never a stretch, so a gap the
 * transcript meant to leave is still left. A line with no room at all -- two
 * segments landing on the same frame -- is dropped rather than placed as a
 * clip too short to read.
 *
 * Returns the clips actually created, in timeline order.
 */
export function placeTimedCaptions(
  engine: TimelineEngine,
  fps: number,
  lines: ReadonlyArray<Pick<CaptionLine, "start" | "end" | "text">>,
  offsetFrames: number,
  style: TextStyle,
  options?: CaptionPlacement,
): Clip[] {
  if (lines.length === 0) return [];

  const timed = lines
    .map((line) => ({
      text: line.text,
      startFrame: Math.max(0, offsetFrames + Math.round(line.start * fps)),
      endFrame: Math.max(0, offsetFrames + Math.round(line.end * fps)),
    }))
    .sort((a, b) => a.startFrame - b.startFrame);

  const trackId = options?.trackId ?? captionTrack(engine, options?.trackName ?? "Captions");
  const y = options?.y ?? 0.86;
  const placed: Clip[] = [];

  engine.batch(() => {
    for (let index = 0; index < timed.length; index += 1) {
      const line = timed[index];
      const nextStart = timed[index + 1]?.startFrame ?? Number.POSITIVE_INFINITY;
      // durationFrames counts from startFrame, so ending at nextStart puts the
      // clip's last frame at nextStart - 1: adjacent, never overlapping.
      const durationFrames = Math.min(line.endFrame, nextStart) - line.startFrame;
      if (durationFrames < 1) continue;
      placed.push(
        addCaptionClip(engine, trackId, line.text, line.startFrame, durationFrames, style, y),
      );
    }
  }, "Captions");

  return placed;
}

export function deleteCurrentCaptions(engine: TimelineEngine): number {
  const project = engine.getProject();
  let removed = 0;
  engine.batch(() => {
    for (const track of project.tracks) {
      if (track.kind !== "elements" || (track.name !== "Captions" && track.name !== "Captions 2" && track.name !== "Lyrics")) {
        continue;
      }
      for (const clip of [...(project.clips[track.id] ?? [])]) {
        engine.removeClip(clip.id, track.id);
        removed += 1;
      }
    }
  });
  captionIds.clear();
  return removed;
}

function srtStamp(seconds: number): string {
  const safe = Math.max(0, seconds);
  const pad = (value: number, size = 2) => String(value).padStart(size, "0");
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);
  const ms = Math.round((safe - Math.floor(safe)) * 1000);
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)},${pad(ms, 3)}`;
}

/** SRT for transcribed lines, timed against the source media the burn receives. */
export function srtFromCaptions(lines: ReadonlyArray<CaptionLine>): string {
  const blocks: string[] = [];
  for (const line of lines) {
    const text = line.text.trim();
    if (!text) continue;
    blocks.push(
      `${blocks.length + 1}\n${srtStamp(line.start)} --> ${srtStamp(line.end)}\n${text}\n`,
    );
  }
  return blocks.join("\n");
}

export function playheadFrame(): number {
  return playbackStore.getState().currentFrame;
}

export function seekFrame(frame: number): void {
  playbackStore.getState().setCurrentFrame(Math.max(0, Math.round(frame)));
}
