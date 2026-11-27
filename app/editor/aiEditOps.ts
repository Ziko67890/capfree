"use client";

import {
  playbackStore,
  type Clip,
  type TimelineEngine,
} from "@elah/editor";
import type { AiEditOperation } from "./api";
import {
  requestMusicTrack,
  requestSilenceDetect,
  searchMusic,
} from "./api";
import { fetchCaptions, placeTimedCaptions } from "./captionActions";
import { selectClip } from "./clipEdit";
import { addAudioBlob } from "./placeMedia";
import type { TimeRange } from "./previewLook";
import { fileFromClip, targetMediaClip, targetVideoClip } from "./timelineMedia";

/**
 * Applying one operation from /ai-edit, and being able to take it back.
 *
 * Every operation returns its own `undo`, rather than leaning on the engine's
 * history. The panel lets any chip be undone at any time, including one from
 * three messages ago, and an undo stack can only unwind the most recent thing.
 * So each handler captures exactly what it needs to reverse itself -- the ids
 * of the clips it created, the value of the property it overwrote -- and the
 * chip holds on to that closure.
 *
 * The cost of that is that an undo can go stale: delete an AI-added clip by
 * hand and its chip's undo has nothing left to remove. Each one is written to
 * tolerate that rather than throw.
 */

/** What the panel needs to draw a chip, and what it needs to take the edit back. */
export interface AppliedEdit {
  id: string;
  /** The chip's text, e.g. 'Hook text — "Watch This First" at 0:00-0:03'. */
  label: string;
  /** Picks the chip's dot colour: blue for picture, green for text, orange for sound. */
  tone: "blue" | "green" | "orange";
  undo: () => void;
}

/** Everything a handler may need that is not in the operation itself. */
export interface OpContext {
  engine: TimelineEngine;
  fps: number;
  look: {
    activeFilter: string | null;
    filterCss: string;
    activeMotion: string | null;
    motionCss: string;
    silences: TimeRange[];
    setFilter: (name: string | null, css: string) => void;
    setMotion: (name: string | null, css: string) => void;
    setSilences: (ranges: TimeRange[]) => void;
  };
}

/** An operation that could not run says why, in words a person can act on. */
export class OpSkipped extends Error {}

let counter = 0;
function nextId(): string {
  counter += 1;
  return `ai-edit-${counter}`;
}

function timecode(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** Removes clips by id, skipping any that are already gone. */
function removeClips(engine: TimelineEngine, ids: ReadonlyArray<string>): void {
  engine.batch(() => {
    for (const id of ids) {
      const found = engine.findClip(id);
      if (found) engine.removeClip(id, found.trackId);
    }
  });
}

/** The vertical position a hook or a caption sits at, as a 0-1 stage fraction. */
function stageY(position: string | undefined): number {
  if (position === "bottom") return 0.84;
  if (position === "center" || position === "middle") return 0.5;
  return 0.16;
}

/**
 * An elements track called `name` with nothing in the given span.
 *
 * `ensureTrack` matches on kind alone, so it hands back whichever elements
 * track exists -- which for captions would be the hook's track. This matches
 * on the name too, and when that track is already busy across the span it
 * opens the next one ("Text 2", "Text 3") rather than failing: addClip throws
 * on an overlap, and two hooks on one timeline is an ordinary thing to want.
 */
function freeElementsTrack(
  engine: TimelineEngine,
  name: string,
  startFrame: number,
  durationFrames: number,
): string {
  const end = startFrame + durationFrames;
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    const trackName = attempt === 1 ? name : `${name} ${attempt}`;
    const existing = engine
      .getProject()
      .tracks.find((track) => track.kind === "elements" && track.name === trackName);
    if (!existing) return engine.addTrack("elements", { name: trackName }).id;
    const busy = engine
      .getClipsOnTrack(existing.id)
      .some((clip) => clip.startFrame < end && clip.startFrame + clip.durationFrames > startFrame);
    if (!busy) return existing.id;
  }
  throw new OpSkipped(`Every "${name}" track is busy at that point on the timeline.`);
}

/* ---------------------------------------------------------------------------
   The handlers.
   --------------------------------------------------------------------------- */

function addText(op: AiEditOperation, ctx: OpContext): AppliedEdit {
  const { engine, fps } = ctx;
  const content = op.text?.trim() || "Watch This First 👀";
  const start = Math.max(0, op.start ?? 0);
  const end = Math.max(start + 0.5, op.end ?? start + 3);

  const startFrame = Math.round(start * fps);
  const durationFrames = Math.max(1, Math.round((end - start) * fps));
  const trackId = freeElementsTrack(engine, "Text", startFrame, durationFrames);
  const clip = engine.addClip({
    trackId,
    type: "text",
    name: content.slice(0, 40),
    startFrame,
    durationFrames,
    text: {
      content,
      // Big and bold: a hook is read in the first second of a scroll, which is
      // the whole reason it is there.
      fontSize: op.style === "hook" ? 86 : 64,
      color: "#ffffff",
      fontWeight: "bold",
      textAlign: "center",
    },
    transform: {
      x: 0.5,
      y: stageY(op.position),
      scale: 1,
      rotation: 0,
      anchor: { x: 0.5, y: 0.5 },
    },
  });
  selectClip(clip.id);

  return {
    id: nextId(),
    tone: "blue",
    label: `Hook text — "${content}" at ${timecode(start)}–${timecode(end)}`,
    undo: () => removeClips(engine, [clip.id]),
  };
}

async function addCaptions(op: AiEditOperation, ctx: OpContext): Promise<AppliedEdit> {
  const { engine, fps } = ctx;

  /*
    The operation arrives with `segments: []` -- the API does the keyword
    matching, not the transcription. The editor already has a real caption
    pipeline behind /captions, so this uses it rather than laying down
    placeholder text: the chip's segment count then means something.
  */
  const supplied = (op.segments ?? []) as { start: number; end: number; text: string }[];
  let lines = supplied;
  // Captions are timed against the clip's source, so they are laid down at the
  // offset between the clip's place on the timeline and where it was cut from.
  let offsetFrames = 0;
  if (lines.length === 0) {
    const transcribed = await fetchCaptions(engine);
    lines = transcribed.response.captions;
    offsetFrames = transcribed.offsetFrames;
  }

  if (lines.length === 0) {
    throw new OpSkipped("No speech found in the clip, so there is nothing to caption.");
  }

  /*
    placeTimedCaptions owns the frame maths -- converting every timestamp
    before placing anything, so segments that touch cannot round into an
    overlap the engine would refuse. What is still decided here is the track:
    a free one, so an AI caption pass does not collide with captions the
    Captions panel already laid down.
  */
  const starts = lines.map((line) => Math.max(0, offsetFrames + Math.round(line.start * fps)));
  const ends = lines.map((line) => Math.max(0, offsetFrames + Math.round(line.end * fps)));
  const from = Math.min(...starts);
  const trackId = freeElementsTrack(engine, "Captions", from, Math.max(...ends) - from);

  const created = placeTimedCaptions(
    engine,
    fps,
    lines,
    offsetFrames,
    { fontSize: 44, color: "#ffffff", fontFamily: "Inter", fontWeight: "bold" },
    { trackId },
  ).map((clip) => clip.id);

  if (created.length === 0) {
    throw new OpSkipped("The transcript was too tightly packed to lay out as captions.");
  }

  return {
    id: nextId(),
    tone: "green",
    label: `Auto-captions generated · ${created.length} segment${created.length === 1 ? "" : "s"}`,
    undo: () => removeClips(engine, created),
  };
}

async function trimSilences(op: AiEditOperation, ctx: OpContext): Promise<AppliedEdit> {
  const { engine, look } = ctx;
  const located = targetVideoClip(engine);
  if (!located) throw new OpSkipped("Put a video on the timeline first.");

  const file = await fileFromClip(located.clip);
  const found = await requestSilenceDetect(file);
  if (found.silences.length === 0) {
    throw new OpSkipped("No silences long enough to be worth marking.");
  }

  /*
    Marked, not cut. Removing them is a destructive ripple across every track,
    which the Filler Fix panel does deliberately and with a preview; doing it
    from a one-line prompt -- and then having to put it back when the chip is
    undone -- is not a trade worth making. So the ranges are drawn on the scrub
    bar and the cut stays a decision.
  */
  const previous = look.silences;
  const ranges = found.silences.map((range) => ({ start: range.start, end: range.end }));
  look.setSilences(ranges);

  const count = ranges.length;
  return {
    id: nextId(),
    tone: "orange",
    label: `${count} silent stretch${count === 1 ? "" : "es"} marked · ${found.totalSilence.toFixed(1)}s total`,
    undo: () => look.setSilences(previous),
  };
}

async function addMusic(op: AiEditOperation, ctx: OpContext): Promise<AppliedEdit> {
  const { engine } = ctx;
  const genre = op.genre?.trim() || "chill";

  const found = await searchMusic(genre);
  const track = found.tracks[0];
  if (!track) throw new OpSkipped(`No royalty-free music matched "${genre}".`);

  const blob = await requestMusicTrack(track.previewUrl);
  const clipId = await addAudioBlob(engine, blob, track.title, playbackStore.getState().currentFrame);
  if (!clipId) throw new OpSkipped("Could not place that track on the timeline.");

  // Backing music sits under whatever else is there, which is what the
  // operation's `volume` means.
  const volume = op.volume ?? 0.3;
  const placed = engine.findClip(clipId);
  if (placed) engine.updateClip(clipId, placed.trackId, { volume });

  const credit = track.requiresAttribution ? ` · credit ${track.artist}` : "";
  return {
    id: nextId(),
    tone: "orange",
    label: `${genre} music — "${track.title}" at ${Math.round(volume * 100)}%${credit}`,
    undo: () => removeClips(engine, [clipId]),
  };
}

function audioDuck(op: AiEditOperation, ctx: OpContext): AppliedEdit {
  const { engine } = ctx;
  const ratio = op.voice_ratio ?? 0.2;

  /*
    A flat level, not an envelope that follows the voice. Real ducking needs
    per-frame gain automation keyed off speech detection; what the clip model
    offers is one volume, so this turns the music down for its whole length and
    the chip says as much.
  */
  const project = engine.getProject();
  const audioTracks = project.tracks.filter((track) => track.kind === "audio");
  const targets: { clipId: string; trackId: string; was: number }[] = [];
  for (const track of audioTracks) {
    for (const clip of engine.getClipsOnTrack(track.id)) {
      targets.push({ clipId: clip.id, trackId: track.id, was: clip.volume ?? 1 });
    }
  }
  if (targets.length === 0) throw new OpSkipped("There is no music on the timeline to duck.");

  engine.batch(() => {
    for (const target of targets) {
      engine.updateClip(target.clipId, target.trackId, { volume: ratio });
    }
  });

  return {
    id: nextId(),
    tone: "orange",
    label: `Music level ${Math.round(ratio * 100)}% · ${targets.length} audio clip${targets.length === 1 ? "" : "s"}`,
    undo: () => {
      engine.batch(() => {
        for (const target of targets) {
          if (engine.findClip(target.clipId)) {
            engine.updateClip(target.clipId, target.trackId, { volume: target.was });
          }
        }
      });
    },
  };
}

const GRADES: Record<string, string> = {
  cinematic: "contrast(1.1) saturate(1.2) brightness(0.95)",
  warm: "sepia(0.25) saturate(1.15) brightness(1.04)",
  cool: "hue-rotate(-10deg) saturate(1.1) brightness(0.98)",
};

function colorGrade(op: AiEditOperation, ctx: OpContext): AppliedEdit {
  const { look } = ctx;
  const preset = op.preset ?? "cinematic";
  const css = GRADES[preset] ?? GRADES.cinematic;

  const wasName = look.activeFilter;
  const wasCss = look.filterCss;
  look.setFilter(preset, css);

  return {
    id: nextId(),
    tone: "blue",
    label: `${preset[0].toUpperCase()}${preset.slice(1)} grade on the preview`,
    undo: () => look.setFilter(wasName, wasCss),
  };
}

function speedRamp(op: AiEditOperation, ctx: OpContext): AppliedEdit {
  const { engine } = ctx;
  const located = targetVideoClip(engine) ?? targetMediaClip(engine);
  if (!located) throw new OpSkipped("Select a clip to change the speed of.");

  /*
    One speed for the clip, not a curve. The clip model carries a single
    `speed`, and a true ramp would mean splitting the tail off and speeding
    only that -- which cannot be undone cleanly, because trimClip will not
    lengthen an ordinary clip back to what it was. So the whole clip takes the
    end speed and the chip says which.
  */
  const speed = op.end_speed ?? 2;
  const clip: Clip = located.clip;
  const was = clip.speed ?? 1;
  engine.setClipSpeed(clip.id, located.trackId, speed);
  selectClip(clip.id);

  return {
    id: nextId(),
    tone: "blue",
    label: `Speed ${speed}× on "${clip.name}" (whole clip, not a ramp)`,
    undo: () => {
      if (engine.findClip(clip.id)) engine.setClipSpeed(clip.id, located.trackId, was);
    },
  };
}

// A slow push rather than a jump, so it reads as camera movement. The
// animation lives in globals.css under .capfree-kenburns.
const MOTIONS: Record<string, string> = {
  ken_burns: "kenburns",
  push_in: "pushin",
};

function zoomPan(op: AiEditOperation, ctx: OpContext): AppliedEdit {
  const { look } = ctx;
  const style = op.style ?? "ken_burns";
  const motion = MOTIONS[style] ?? MOTIONS.ken_burns;

  const wasName = look.activeMotion;
  const wasCss = look.motionCss;
  look.setMotion(style, motion);

  return {
    id: nextId(),
    tone: "blue",
    label: style === "ken_burns" ? "Ken Burns push on the preview" : "Zoom on the preview",
    undo: () => look.setMotion(wasName, wasCss),
  };
}

/**
 * Runs one operation and returns the chip that can take it back.
 *
 * Throws `OpSkipped` when the timeline is not in a state the operation can
 * work on -- no video to caption, no music to duck -- which the panel reports
 * next to the others rather than failing the whole message.
 */
export async function applyOperation(
  op: AiEditOperation,
  ctx: OpContext,
): Promise<AppliedEdit> {
  switch (op.op) {
    case "add_text":
      return addText(op, ctx);
    case "add_captions":
      return addCaptions(op, ctx);
    case "trim_silences":
      return trimSilences(op, ctx);
    case "add_music":
      return addMusic(op, ctx);
    case "audio_duck":
      return audioDuck(op, ctx);
    case "color_grade":
      return colorGrade(op, ctx);
    case "speed_ramp":
      return speedRamp(op, ctx);
    case "zoom_pan":
      return zoomPan(op, ctx);
    default:
      throw new OpSkipped(`"${String(op.op)}" is not an edit this editor knows.`);
  }
}

/** What the panel reports while an operation is in flight. */
export const OP_STATUS: Record<AiEditOperation["op"], string> = {
  add_text: "Adding the hook…",
  add_captions: "Transcribing the clip…",
  trim_silences: "Listening for silences…",
  add_music: "Finding a track…",
  audio_duck: "Setting the music level…",
  color_grade: "Grading the preview…",
  speed_ramp: "Changing the speed…",
  zoom_pan: "Adding the push…",
};
