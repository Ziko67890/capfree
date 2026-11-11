import { createEffect, type Effect } from "@elah/core";
import {
  playbackStore,
  selectionStore,
  type ActionFailureReason,
  type Clip,
  type TimelineEngine,
  type TrackKind,
  type Transform,
} from "@elah/editor";
import type { EffectPreset, FilterPreset } from "./catalog";

const VISUAL = new Set(["video", "image", "text", "shape", "freehand"]);

export interface LocatedClip {
  clip: Clip;
  trackId: string;
}

export interface AdjustmentValues {
  brightness: number;
  contrast: number;
  saturation: number;
  sharpness: number;
  vignette: number;
  /** Warm/cool, straight onto the grade's temperature. */
  temperature: number;
  tint: number;
  /** Scales the whites, via the grade's gain. */
  highlights: number;
  /** Raises or crushes the blacks, via the grade's lift. */
  shadows: number;
  grain: number;
}

export function selectedClips(engine: TimelineEngine): LocatedClip[] {
  const hits: LocatedClip[] = [];
  for (const id of selectionStore.getState().selectedClipIds) {
    const found = engine.findClip(id);
    if (found) hits.push(found);
  }
  return hits;
}

export function ensureTrack(engine: TimelineEngine, kind: TrackKind, name: string): string {
  const existing = engine.getProject().tracks.find((track) => track.kind === kind);
  if (existing) return existing.id;
  return engine.addTrack(kind, { name }).id;
}

export function selectClip(clipId: string): void {
  selectionStore.getState().selectClips([clipId]);
}

function baseTransform(clip: Clip): Transform {
  return (
    clip.transform ?? {
      x: 0.5,
      y: 0.5,
      scale: 1,
      rotation: 0,
      anchor: { x: 0.5, y: 0.5 },
    }
  );
}

/** Stage position is stored as 0–1. The inspector shows that as 0–100. */
export function placeTextClip(
  engine: TimelineEngine,
  fps: number,
  content: string,
  options?: { fontSize?: number; y?: number; durationSec?: number },
): Clip {
  const trackId = ensureTrack(engine, "elements", "Text");
  const durationFrames = Math.max(1, Math.round(fps * (options?.durationSec ?? 3)));
  const startFrame = freeFrame(engine, trackId, playbackStore.getState().currentFrame, durationFrames);
  const clip = engine.addClip({
    trackId,
    type: "text",
    name: content.slice(0, 40) || "Text",
    startFrame,
    durationFrames,
    text: {
      content,
      fontSize: options?.fontSize ?? 64,
      color: "#ffffff",
      fontWeight: "bold",
      textAlign: "center",
    },
    transform: {
      x: 0.5,
      y: options?.y ?? 0.42,
      scale: 1,
      rotation: 0,
      anchor: { x: 0.5, y: 0.5 },
    },
  });
  selectClip(clip.id);
  return clip;
}

export function visualTarget(engine: TimelineEngine): LocatedClip | { error: string } {
  const hits = selectedClips(engine);
  if (hits.length === 0) return { error: "Select a clip first." };
  const visual = hits.find((hit) => VISUAL.has(hit.clip.type));
  if (!visual) return { error: "Select a video, image, or text clip." };
  return visual;
}

export function applyEffectPreset(engine: TimelineEngine, preset: EffectPreset): string | null {
  const target = visualTarget(engine);
  if ("error" in target) return target.error;
  const kept = (target.clip.effects ?? []).filter((effect) => effect.kind !== preset.kind);
  const effect = createEffect(preset.kind);
  if (preset.params) effect.params = { ...effect.params, ...preset.params };
  engine.updateClip(target.clip.id, target.trackId, { effects: [...kept, effect] });
  return null;
}

export function applyFilterPreset(engine: TimelineEngine, preset: FilterPreset): string | null {
  const target = visualTarget(engine);
  if ("error" in target) return target.error;
  const kept = (target.clip.effects ?? []).filter((effect) => effect.kind !== "colorGrade");
  const grade = preset.presetId ? createEffect("colorGrade", preset.presetId) : createEffect("colorGrade");
  if (preset.params) grade.params = { ...grade.params, ...preset.params };
  engine.updateClip(target.clip.id, target.trackId, { effects: [...kept, grade] });
  return null;
}

/** Strips every engine effect off the selected clip. */
export function clearClipEffects(engine: TimelineEngine): string | null {
  const target = visualTarget(engine);
  if ("error" in target) return target.error;
  engine.updateClip(target.clip.id, target.trackId, { effects: [] });
  return null;
}

/** Effect kinds currently on the selected clip, for highlighting active presets. */
export function activeEffectKinds(engine: TimelineEngine): Set<string> {
  const target = visualTarget(engine);
  if ("error" in target) return new Set();
  return new Set((target.clip.effects ?? []).map((effect) => effect.kind));
}

function numberParam(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function readAdjustments(clip: Clip): AdjustmentValues {
  const grade = clip.effects?.find((effect) => effect.kind === "colorGrade");
  const blur = clip.effects?.find((effect) => effect.kind === "gaussianBlur");
  const vignette = clip.effects?.find((effect) => effect.kind === "vignette");
  const grain = clip.effects?.find((effect) => effect.kind === "grain");
  const radius = numberParam(blur?.params.radius, 0);
  return {
    brightness: Math.round(numberParam(grade?.params.exposure, 0) * 100),
    contrast: Math.round((numberParam(grade?.params.contrast, 1) - 1) * 100),
    saturation: Math.round((numberParam(grade?.params.saturation, 1) - 1) * 100),
    sharpness: radius > 0 ? -Math.round((radius / 24) * 100) : 0,
    vignette: Math.round(numberParam(vignette?.params.amount, 0) * 100),
    temperature: Math.round(numberParam(grade?.params.temperature, 0) * 100),
    tint: Math.round(numberParam(grade?.params.tint, 0) * 100),
    highlights: Math.round((numberParam(grade?.params.gain, 1) - 1) * 200),
    shadows: Math.round(numberParam(grade?.params.lift, 0) * 200),
    grain: Math.round(numberParam(grain?.params.amount, 0) * 100),
  };
}

export function readGamma(clip: Clip): number {
  const grade = clip.effects?.find((effect) => effect.kind === "colorGrade");
  return numberParam(grade?.params.gamma, 1);
}

/**
 * The effect registry has no unsharp mask. Sharpness above 0 lowers gamma
 * (crisper mids). Sharpness below 0 adds gaussian blur.
 */
export function adjustmentEffects(
  existing: Effect[] | undefined,
  values: AdjustmentValues,
  baseGamma: number,
): Effect[] {
  const kept = (existing ?? []).filter(
    (effect) =>
      effect.kind !== "colorGrade" &&
      effect.kind !== "gaussianBlur" &&
      effect.kind !== "vignette" &&
      effect.kind !== "grain",
  );
  const previous = existing?.find((effect) => effect.kind === "colorGrade");
  const grade = previous
    ? { ...previous, params: { ...previous.params } }
    : createEffect("colorGrade");
  grade.params = {
    ...grade.params,
    exposure: clamp(values.brightness / 100, -2, 2),
    contrast: clamp(1 + values.contrast / 100, 0, 2),
    saturation: clamp(1 + values.saturation / 100, 0, 2),
    gamma: values.sharpness > 0 ? clamp(1 - values.sharpness / 250, 0.2, 3) : baseGamma,
    temperature: clamp(values.temperature / 100, -1, 1),
    tint: clamp(values.tint / 100, -1, 1),
    // gain spans 0..2 and lift -0.5..0.5, so a full slider is half a unit.
    gain: clamp(1 + values.highlights / 200, 0, 2),
    lift: clamp(values.shadows / 200, -0.5, 0.5),
  };
  const next: Effect[] = [...kept, grade];
  if (values.sharpness < 0) {
    const blur = createEffect("gaussianBlur");
    blur.params = { ...blur.params, radius: clamp((-values.sharpness / 100) * 24, 0, 100) };
    next.push(blur);
  }
  if (values.vignette > 0) {
    const vignette = createEffect("vignette");
    vignette.params = { ...vignette.params, amount: clamp(values.vignette / 100, 0, 1) };
    next.push(vignette);
  }
  if (values.grain > 0) {
    const grain = createEffect("grain");
    grain.params = { ...grain.params, amount: clamp(values.grain / 100, 0, 1) };
    next.push(grain);
  }
  return next;
}

export function withTransform(clip: Clip, patch: Partial<Transform>): Transform {
  const current = baseTransform(clip);
  return { ...current, ...patch, anchor: patch.anchor ?? current.anchor };
}

type ClipboardItem = { clipId: string; trackId: string; offset: number };
let clipboard: ClipboardItem[] = [];

export function copySelection(engine: TimelineEngine): string | null {
  const hits = selectedClips(engine);
  if (hits.length === 0) return "Select a clip to copy.";
  const origin = Math.min(...hits.map((hit) => hit.clip.startFrame));
  clipboard = hits.map((hit) => ({
    clipId: hit.clip.id,
    trackId: hit.trackId,
    offset: hit.clip.startFrame - origin,
  }));
  return null;
}

/** First frame at or after `desired` where a clip of this length does not overlap. */
export function freeFrame(engine: TimelineEngine, trackId: string, desired: number, duration: number): number {
  const clips = [...(engine.getProject().clips[trackId] ?? [])].sort((a, b) => a.startFrame - b.startFrame);
  let start = Math.max(0, desired);
  for (const clip of clips) {
    const end = clip.startFrame + clip.durationFrames;
    if (start + duration <= clip.startFrame) break;
    if (start < end) start = end;
  }
  return start;
}

export function pasteSelection(engine: TimelineEngine, frame: number): string | null {
  if (clipboard.length === 0) return "Copy a clip first.";
  const ids: string[] = [];
  engine.batch(() => {
    for (const item of clipboard) {
      const found = engine.findClip(item.clipId);
      if (!found) continue;
      // The engine refuses a clone that overlaps, so slide it to the next open gap.
      const start = freeFrame(engine, item.trackId, frame + item.offset, found.clip.durationFrames);
      const id = engine.cloneClip(item.clipId, item.trackId, start);
      if (id) ids.push(id);
    }
  }, "Paste clips");
  if (ids.length === 0) return "The copied clip is no longer on the timeline.";
  selectionStore.getState().selectClips(ids);
  return null;
}

/** Clones each selected clip into the first free slot after itself. */
export function duplicateSelection(engine: TimelineEngine): string | null {
  const hits = selectedClips(engine);
  if (hits.length === 0) return "Select a clip to duplicate.";
  const ids: string[] = [];
  engine.batch(() => {
    for (const hit of hits) {
      const after = hit.clip.startFrame + hit.clip.durationFrames;
      const start = freeFrame(engine, hit.trackId, after, hit.clip.durationFrames);
      const id = engine.cloneClip(hit.clip.id, hit.trackId, start);
      if (id) ids.push(id);
    }
  }, "Duplicate clips");
  if (ids.length === 0) return "Could not duplicate that clip.";
  selectionStore.getState().selectClips(ids);
  return null;
}

/** Why a split was refused, in words. Shared by the toolbar and the shortcut. */
export const SPLIT_MESSAGE: Partial<Record<ActionFailureReason, string>> = {
  "no-selection": "Select a clip to split.",
  "multi-selection": "Select a single clip to split.",
  "playhead-outside-clip": "Move the playhead inside the clip.",
  "cannot-split-while-playing": "Pause playback before splitting.",
  "clip-not-found": "That clip is no longer on the timeline.",
  "track-locked": "This track is locked.",
};

export function deleteSelection(engine: TimelineEngine): string | null {
  const hits = selectedClips(engine);
  if (hits.length === 0) return "Select a clip to delete.";
  engine.batch(() => {
    for (const hit of hits) engine.removeClip(hit.clip.id, hit.trackId);
  }, "Delete clips");
  return null;
}
