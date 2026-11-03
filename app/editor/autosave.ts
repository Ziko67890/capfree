"use client";

import {
  deserializeProject,
  isRecoverableMediaSrc,
  serializeProject,
  type TimelineEngine,
} from "@elah/editor";

export const AUTOSAVE_KEY = "capfree_autosave";

export interface AutoSave {
  /** Epoch millis of the snapshot. */
  savedAt: number;
  /** Clip count at save time, so the banner can describe what is on offer. */
  clips: number;
  /** The serialized project, handed straight back to the engine. */
  project: string;
}

function clipCount(engine: TimelineEngine): number {
  const clips = engine.getProject().clips;
  return Object.values(clips).reduce((total, list) => total + list.length, 0);
}

/**
 * Snapshots the project. Returns false when there was nothing worth saving or
 * storage refused it — a private window and a full quota both throw, and
 * autosave is best effort either way.
 */
export function writeAutoSave(engine: TimelineEngine): boolean {
  const clips = clipCount(engine);
  // An empty timeline is not worth offering back on the next load.
  if (clips === 0) return false;
  try {
    const envelope: AutoSave = {
      savedAt: Date.now(),
      clips,
      project: serializeProject(engine),
    };
    window.localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(envelope));
    return true;
  } catch {
    return false;
  }
}

/** The stored snapshot, or null if there is none worth offering. */
export function readAutoSave(): AutoSave | null {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(AUTOSAVE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<AutoSave>;
    if (typeof parsed.project !== "string" || parsed.project.length === 0) return null;
    if (typeof parsed.savedAt !== "number" || !Number.isFinite(parsed.savedAt)) return null;
    const clips = typeof parsed.clips === "number" ? parsed.clips : 0;
    if (clips <= 0) return null;
    return { savedAt: parsed.savedAt, clips, project: parsed.project };
  } catch {
    return null;
  }
}

export function clearAutoSave(): void {
  try {
    window.localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    /* Nothing to do: the snapshot is already unreachable. */
  }
}

/** Loads a snapshot into the engine. Returns a message on failure, else null. */
export function applyAutoSave(engine: TimelineEngine, save: AutoSave): string | null {
  try {
    deserializeProject(engine, save.project);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "That saved session could not be read.";
  }
}

/**
 * Clips whose media cannot have survived the reload. Imported footage lives
 * behind a blob: URL that dies with the page, so a restored project points at
 * sources the browser can no longer resolve.
 */
export function clipsWithLostMedia(engine: TimelineEngine): number {
  let lost = 0;
  for (const list of Object.values(engine.getProject().clips)) {
    for (const clip of list) {
      if (clip.src && !isRecoverableMediaSrc(clip.src)) lost += 1;
    }
  }
  return lost;
}

/** "2 minutes ago", for the restore banner. */
export function describeAge(savedAt: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - savedAt) / 1000));
  if (seconds < 60) return "less than a minute ago";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
