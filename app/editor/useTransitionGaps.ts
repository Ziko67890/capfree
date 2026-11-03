"use client";

import { useTracksStore, useTransitionsStore, type Clip, type Transition } from "@elah/editor";

/** A cut between two neighbouring clips, plus whatever bridges it. */
export interface TransitionGap {
  /** Stable while the pair survives: the track plus the outgoing clip. */
  id: string;
  trackId: string;
  trackName: string;
  /** 1-based position of the cut along its own track. */
  index: number;
  from: Clip;
  to: Clip;
  /**
   * Usually none or one. The engine appends transitions without checking for
   * one already on the pair, so a project can carry a stack of them.
   */
  transitions: Transition[];
}

/**
 * Every cut between neighbouring visual clips, with the transitions sitting on
 * it. Re-renders when the timeline or its transitions change, so a panel can
 * mark which cuts are already bridged.
 */
export function useTransitionGaps(): TransitionGap[] {
  const tracks = useTracksStore((state) => state.tracks);
  const clips = useTracksStore((state) => state.clips);
  const transitions = useTransitionsStore((state) => state.transitions);

  const gaps: TransitionGap[] = [];
  for (const track of [...tracks].sort((a, b) => a.order - b.order)) {
    if (track.kind === "audio") continue;
    const ordered = (clips[track.id] ?? [])
      .filter((clip) => clip.type !== "audio")
      .sort((a, b) => a.startFrame - b.startFrame);

    for (let i = 0; i < ordered.length - 1; i += 1) {
      const from = ordered[i];
      const to = ordered[i + 1];
      gaps.push({
        id: `${track.id}:${from.id}`,
        trackId: track.id,
        trackName: track.name,
        index: i + 1,
        from,
        to,
        transitions: transitions.filter(
          (item) =>
            item.trackId === track.id &&
            item.fromClipId === from.id &&
            item.toClipId === to.id,
        ),
      });
    }
  }
  return gaps;
}
