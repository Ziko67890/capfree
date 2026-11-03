"use client";

const RECENT_KEY = "capfree_audio_recent";
const LIMIT = 5;

export interface RecentAudio {
  /** Catalog id, or the media library asset id for the user's own audio. */
  id: string;
  title: string;
  artist: string;
  durationSec: number;
  /** Also what gets added again, so a recent entry stays usable. */
  previewUrl: string;
  /** Present for library audio, which is inserted by asset rather than URL. */
  assetId?: string;
}

function isRecent(value: unknown): value is RecentAudio {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<RecentAudio>;
  return (
    typeof item.id === "string" &&
    typeof item.title === "string" &&
    typeof item.previewUrl === "string" &&
    item.previewUrl.length > 0
  );
}

/** The last few tracks added, newest first. Never throws. */
export function readRecents(): RecentAudio[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(RECENT_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecent).slice(0, LIMIT).map((item) => ({
      id: item.id,
      title: item.title,
      artist: typeof item.artist === "string" ? item.artist : "",
      durationSec: typeof item.durationSec === "number" ? item.durationSec : 0,
      previewUrl: item.previewUrl,
      ...(item.assetId ? { assetId: item.assetId } : {}),
    }));
  } catch {
    return [];
  }
}

/**
 * Moves an entry to the front and trims to five. Returns the new list so the
 * caller can render it without a second read.
 */
export function rememberRecent(entry: RecentAudio): RecentAudio[] {
  const next = [entry, ...readRecents().filter((item) => item.id !== entry.id)].slice(0, LIMIT);
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* A private window still gets the in-memory list back. */
  }
  return next;
}
