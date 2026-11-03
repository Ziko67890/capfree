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

export function placeTimedCaption(
  engine: TimelineEngine,
  fps: number,
  line: Pick<CaptionLine, "start" | "end" | "text">,
  offsetFrames: number,
  style: TextStyle,
  options?: { trackName?: string; y?: number },
): Clip {
  const trackId = captionTrack(engine, options?.trackName ?? "Captions");
  const durationSec = Math.max(0.35, line.end - line.start);
  const startFrame = Math.max(0, offsetFrames + Math.round(line.start * fps));
  const clip = engine.addClip({
    trackId,
    type: "text",
    name: line.text.slice(0, 48) || "Caption",
    startFrame,
    durationFrames: Math.max(1, Math.round(durationSec * fps)),
    text: {
      content: line.text,
      fontSize: style.fontSize,
      color: style.color,
      fontFamily: style.fontFamily,
      fontWeight: style.fontWeight,
      textAlign: "center",
    },
    transform: {
      x: 0.5,
      y: options?.y ?? 0.86,
      scale: 1,
      rotation: 0,
      anchor: { x: 0.5, y: 0.5 },
    },
  });
  captionIds.add(clip.id);
  return clip;
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
