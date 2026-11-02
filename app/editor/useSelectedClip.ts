"use client";

import { useSelectionStore, useTracksStore, type Clip } from "@elah/editor";

/**
 * The first selected clip, re-rendered when the timeline or selection changes.
 * No manual memo: React Compiler cannot preserve one across the Set iteration,
 * so it caches the result itself instead.
 */
export function useSelectedClip(): { clip: Clip; trackId: string } | null {
  const selected = useSelectionStore((state) => state.selectedClipIds);
  const clips = useTracksStore((state) => state.clips);

  const id = selected.values().next().value;
  if (!id) return null;
  for (const [trackId, list] of Object.entries(clips)) {
    const clip = list.find((item) => item.id === id);
    if (clip) return { clip, trackId };
  }
  return null;
}
