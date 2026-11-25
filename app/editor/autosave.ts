"use client";

import {
  isRecoverableMediaSrc,
  readProjectDocument,
  type TimelineEngine,
} from "@elah/editor";

export const AUTOSAVE_KEY = "capfree_autosave";

export interface AutoSave {
  /** Epoch millis of the snapshot. */
  savedAt: number;
  /** Clip count at save time, so the banner can describe what is on offer. */
  clips: number;
  /**
   * The project document itself, nested in the envelope rather than embedded
   * in it as a string of JSON. `unknown` because it has been through storage
   * and is only a project once `readProjectDocument` says so.
   */
  project: object;
}

/**
 * Normalizes either stored shape to the project document.
 *
 * Snapshots written before the double encode came out hold a string of JSON,
 * which is parsed once here. Reading both keeps a session someone has not
 * reloaded since from being thrown away by the upgrade.
 */
function storedProject(stored: unknown): object | null {
  if (typeof stored === "string") {
    if (stored.length === 0) return null;
    try {
      const parsed: unknown = JSON.parse(stored);
      return parsed !== null && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }
  return stored !== null && typeof stored === "object" ? stored : null;
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
    /*
      The project goes in as an object. It used to go in as the string
      serializeProject returns, which the envelope's own JSON.stringify then
      escaped quote by quote -- roughly doubling what reached localStorage, to
      encode something that was already encoded, and leaving the reader a
      second parse to undo it. One pass covers both now.
    */
    const envelope: AutoSave = {
      savedAt: Date.now(),
      clips,
      project: engine.getProject(),
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
    if (typeof parsed.savedAt !== "number" || !Number.isFinite(parsed.savedAt)) return null;
    const clips = typeof parsed.clips === "number" ? parsed.clips : 0;
    if (clips <= 0) return null;
    const project = storedProject(parsed.project);
    if (project === null) return null;
    return { savedAt: parsed.savedAt, clips, project };
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
    // What deserializeProject does once it has parsed its argument. The
    // project arrives as an object here, so that parse — the reading half of
    // the double encode — has nothing left to do.
    engine.loadProject(readProjectDocument(save.project));
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
