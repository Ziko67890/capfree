"use client";

import { playbackStore, type TimelineEngine } from "@elah/editor";
import {
  requestMusicTrack,
  requestSilenceDetect,
  requestSilenceRemoval,
  searchMusic,
} from "./api";
import { addAudioBlob } from "./placeMedia";
import { fileFromClip, replaceClipFile, targetVideoClip } from "./timelineMedia";

/** What the prompt bar reports back once an action has run. */
export interface ActionOutcome {
  message: string;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/**
 * Detects the silent stretches, then cuts exactly those ranges. Two calls
 * rather than letting /silence/remove detect for itself, so the result can say
 * how much came out.
 */
export async function removeSilences(
  engine: TimelineEngine,
  fps: number,
): Promise<ActionOutcome> {
  const located = targetVideoClip(engine);
  if (!located) throw new Error("Add a video to the timeline first.");

  const file = await fileFromClip(located.clip);
  const found = await requestSilenceDetect(file);
  if (found.silences.length === 0) {
    return { message: "No silences long enough to cut — the clip is unchanged." };
  }

  const segments = found.silences.map((range) => ({ start: range.start, end: range.end }));
  const blob = await requestSilenceRemoval(file, { segments, padding: 0 });
  const trimmed = new File([blob], "desilenced.mp4", { type: "video/mp4" });
  await replaceClipFile(engine, located, trimmed, "video", fps);

  return {
    message: `Cut ${plural(segments.length, "silence")} — ${found.totalSilence.toFixed(1)}s removed.`,
  };
}

/** Searches the royalty-free library and drops the top hit at the playhead. */
export async function addMoodMusic(
  engine: TimelineEngine,
  mood: string,
): Promise<ActionOutcome> {
  const term = mood.trim();
  if (!term) throw new Error("Say what kind of music you want.");

  const found = await searchMusic(term);
  const track = found.tracks[0];
  if (!track) throw new Error(`No royalty-free music matched "${term}".`);

  const blob = await requestMusicTrack(track.previewUrl);
  const clipId = await addAudioBlob(
    engine,
    blob,
    track.title,
    playbackStore.getState().currentFrame,
  );
  if (!clipId) throw new Error("Could not place that track on the timeline.");

  return {
    message: track.requiresAttribution
      ? `Added "${track.title}" by ${track.artist} — ${track.licenseLabel}, so credit them.`
      : `Added "${track.title}" by ${track.artist}.`,
  };
}

/**
 * Keeps the first `seconds` of the timeline. Clips that start past the cutoff
 * go; one straddling it is trimmed back to meet it.
 */
export function trimToSeconds(
  engine: TimelineEngine,
  fps: number,
  seconds: number,
): ActionOutcome {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error("Give a length in seconds greater than zero.");
  }
  const cutoff = Math.max(1, Math.round(seconds * fps));
  if (engine.getTotalFrames() === 0) throw new Error("There is nothing on the timeline yet.");
  if (engine.getTotalFrames() <= cutoff) {
    return { message: `The timeline is already shorter than ${seconds}s.` };
  }

  let removed = 0;
  let shortened = 0;
  engine.batch(() => {
    for (const track of engine.getProject().tracks) {
      // Snapshot first: removing a clip mutates the engine's own array.
      for (const clip of [...engine.getClipsOnTrack(track.id)]) {
        if (clip.startFrame >= cutoff) {
          engine.removeClip(clip.id, track.id);
          removed += 1;
        } else if (clip.startFrame + clip.durationFrames > cutoff) {
          engine.trimClip(clip.id, track.id, clip.startFrame, cutoff - clip.startFrame);
          shortened += 1;
        }
      }
    }
  }, `Trim to ${seconds}s`);

  const parts = [];
  if (shortened > 0) parts.push(`${plural(shortened, "clip")} trimmed`);
  if (removed > 0) parts.push(`${plural(removed, "clip")} removed`);
  return {
    message: `Timeline cut to ${seconds}s${parts.length > 0 ? ` — ${parts.join(", ")}` : ""}.`,
  };
}
