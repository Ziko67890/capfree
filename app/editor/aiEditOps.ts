"use client";

import {
  importBlob,
  insertMediaAsset,
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

/**
 * An empty audio track called `name`, created if there is not one already.
 *
 * Empty rather than merely named: a second "add music" should not be dropped
 * on top of the first, and the engine refuses an overlap anyway. So this
 * walks "Music", "Music 2", "Music 3"… until it finds a lane with nothing on
 * it, which is also what keeps each track removable on its own.
 */
function freeAudioTrack(engine: TimelineEngine, name: string): string {
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    const trackName = attempt === 1 ? name : `${name} ${attempt}`;
    const existing = engine
      .getProject()
      .tracks.find((track) => track.kind === "audio" && track.name === trackName);
    if (!existing) return engine.addTrack("audio", { name: trackName }).id;
    if (engine.getClipsOnTrack(existing.id).length === 0) return existing.id;
  }
  throw new OpSkipped(`Every "${name}" track already has something on it.`);
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

  /*
    How far the picture runs, which is where the music has to stop. A stock
    track is whatever length it happens to be -- the first one tried here was
    3:14 over a twelve-second clip -- so dropped in whole it leaves minutes of
    music playing over nothing, and the export is as long as the song.

    Measured as the end of the last visual clip rather than the sum of their
    durations: with a gap between two clips the sum stops short of where the
    picture actually ends, and the music would cut out before the last shot.
  */
  const project = engine.getProject();
  let videoEndFrame = 0;
  for (const track_ of project.tracks) {
    if (track_.kind !== "video") continue;
    for (const clip of engine.getClipsOnTrack(track_.id)) {
      if (clip.type !== "video" && clip.type !== "image") continue;
      videoEndFrame = Math.max(videoEndFrame, clip.startFrame + clip.durationFrames);
    }
  }

  const blob = await requestMusicTrack(track.previewUrl);
  /*
    Its own lane, starting at frame 0. Backing music belongs *under* the
    picture, and the clip's own audio is already sitting at frame 0 on the
    track it came in on -- asked to put a second clip there, the engine finds
    the next free slot instead and the song ends up playing after the video
    rather than beneath it.
  */
  const lane = freeAudioTrack(engine, "Music");
  const clipId = await addAudioBlob(engine, blob, track.title, 0, lane);
  if (!clipId) throw new OpSkipped("Could not place that track on the timeline.");

  const volume = op.volume ?? 0.3;
  const placed = engine.findClip(clipId);
  if (!placed) throw new OpSkipped("The track did not stay on the timeline.");

  // Whichever runs out first. A track shorter than the picture is left at its
  // own length -- there is nothing to stretch it with -- and one longer than
  // the picture is cut back to it.
  const naturalFrames = placed.clip.durationFrames;
  const durationFrames = videoEndFrame > 0 ? Math.min(naturalFrames, videoEndFrame) : naturalFrames;
  engine.updateClip(clipId, placed.trackId, { volume, durationFrames });

  const trimmed = durationFrames < naturalFrames;
  const credit = track.requiresAttribution ? ` · credit ${track.artist}` : "";
  const fitted = trimmed ? " · trimmed to the video" : "";
  return {
    id: nextId(),
    tone: "orange",
    label: `${genre} music — "${track.title}" at ${Math.round(volume * 100)}%${fitted}${credit}`,
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
  // Pushed harder than the usual gentle figures: at contrast 1.1 / brightness
  // 0.95 the grade was invisible on dark footage, which is exactly the
  // material people ask to grade. The sepia is a small warm cast, which is
  // most of what reads as "cinematic" on a quick look.
  cinematic: "contrast(1.15) saturate(1.3) brightness(0.88) sepia(0.08)",
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

// The suffix of the class EditorShell puts on the stage: `ken_burns` becomes
// `capfree-motion-kenburns`. The keyframes live in globals.css.
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

  /*
    Asking for the same move twice turns it off. Without that there is no way
    back from a prompt except the chip, and a second "zoom" reads as "stop
    doing that" far more often than it reads as "do it again".
  */
  const already = look.motionCss === motion;
  if (already) look.setMotion(null, "");
  else look.setMotion(style, motion);

  const name = style === "ken_burns" ? "Ken Burns push" : "Zoom";
  return {
    id: nextId(),
    tone: "blue",
    label: already ? `${name} turned off` : `${name} on the preview`,
    undo: () => look.setMotion(wasName, wasCss),
  };
}

/**
 * The end card: 1920x1080 of black with three lines on it, drawn here and
 * imported as an image clip.
 *
 * Drawn rather than composed from text clips because an end card is one
 * thing, not three: a single clip can be dragged, trimmed and deleted as a
 * unit, where three stacked text clips have to be kept in step by hand. The
 * canvas is the project's own frame size, so it lands pixel-for-pixel.
 */
async function addOutro(op: AiEditOperation, ctx: OpContext): Promise<AppliedEdit> {
  const { engine, fps } = ctx;
  const seconds = op.duration ?? 3;
  const line1 = op.text1 ?? "Thanks for Watching! 🙏";
  const line2 = op.text2 ?? "Like & Subscribe for more";
  const line3 = "🔔 Turn on notifications";

  const canvas = document.createElement("canvas");
  canvas.width = 1920;
  canvas.height = 1080;
  const context = canvas.getContext("2d");
  if (!context) throw new OpSkipped("This browser would not give up a 2D canvas.");

  context.fillStyle = "#000000";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.textAlign = "center";
  context.textBaseline = "alphabetic";

  const centerX = canvas.width / 2;
  context.fillStyle = "#ffffff";
  context.font = "bold 96px sans-serif";
  context.fillText(line1, centerX, 460);
  context.fillStyle = "#5b5ef4";
  context.font = "56px sans-serif";
  context.fillText(line2, centerX, 580);
  context.fillStyle = "#888888";
  context.font = "44px sans-serif";
  context.fillText(line3, centerX, 660);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/png");
  });
  if (!blob) throw new OpSkipped("The end card could not be rendered.");

  // After everything, not after the playhead: an outro that lands mid-timeline
  // is not an outro. The main video track decides where the end is, falling
  // back to the whole project when there is no video on it yet.
  const project = engine.getProject();
  const mainVideo = project.tracks.find((track) => track.kind === "video");
  const lastClipEnd = mainVideo
    ? engine
        .getClipsOnTrack(mainVideo.id)
        .reduce((end, clip) => Math.max(end, clip.startFrame + clip.durationFrames), 0)
    : 0;
  const startFrame = Math.max(lastClipEnd, engine.getTotalFrames());
  const durationFrames = Math.max(1, Math.round(seconds * fps));

  const asset = await importBlob(new File([blob], "outro.png", { type: "image/png" }), {
    name: "Outro",
    kind: "image",
  });
  const result = await insertMediaAsset(engine, asset.id, { desiredStartFrame: startFrame });
  if (!result.ok || result.clipIds.length === 0) {
    throw new OpSkipped("Could not place the end card on the timeline.");
  }
  const clipId = result.clipIds[0];
  engine.updateClip(clipId, result.trackId, { name: "Outro", durationFrames });
  selectClip(clipId);

  return {
    id: nextId(),
    tone: "green",
    label: `Outro card — ${seconds}s from ${timecode(startFrame / fps)}`,
    undo: () => removeClips(engine, [clipId]),
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
    case "add_outro":
      return addOutro(op, ctx);
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
  add_outro: "Drawing the end card…",
};
