"use client";

import { useEffect } from "react";
import { playbackStore } from "@elah/editor";

/** How much clear lane the needle keeps either side of it before the view moves. */
const MARGIN_PX = 96;

/** The attribute the SDK marks its timeline root with. */
const ROOT_SELECTOR = "[data-elah-timeline-root]";

/** The track area is the one child of that root that scrolls horizontally. */
function findScroller(root: HTMLElement): HTMLElement | null {
  for (const child of Array.from(root.children)) {
    if (!(child instanceof HTMLElement)) continue;
    if (getComputedStyle(child).overflowX === "auto") return child;
  }
  return null;
}

/**
 * Scrolls the timeline so the playhead stays on screen.
 *
 * The store already drives both ends of a seek: it sets `currentFrame`, the
 * SDK's Playhead subscribes to that and moves its needle, and EditorProvider
 * forwards the same change to the PlaybackEngine. What is missing is
 * scrolling. The Timeline only ever touches `scrollLeft` to keep a zoom
 * gesture anchored, so at the default 4px per frame -- roughly eleven seconds
 * of visible lane on a 1440px window -- the needle leaves the viewport on any
 * longer project and the timeline reads as frozen, whether the frame moved by
 * playback or by a seek from the preview's scrub bar.
 *
 * Driven from the store subscription rather than a render: the playhead moves
 * every frame during playback and none of this needs React. The write only
 * happens once the needle actually reaches a margin, so following costs one
 * `scrollLeft` assignment per screenful rather than one per frame.
 *
 * `sidebarWidth` has to match what the Timeline is rendering with, which is
 * why EditorShell passes the same constant to both.
 */
export function usePlayheadFollow(sidebarWidth: number): void {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(ROOT_SELECTOR);
    const scroller = root ? findScroller(root) : null;
    if (!root || !scroller) return;

    /*
      A gesture inside the timeline owns the scroll position for its duration.
      Dragging the needle or a clip reads the pointer against `scrollLeft`, so
      scrolling underneath one would carry it further than the pointer moved --
      and, with the pointer parked near an edge, keep doing it. The preview's
      scrub bar is outside this root, so scrubbing there still follows, which
      is the case this exists for.
    */
    let gesture = false;
    const hold = () => {
      gesture = true;
    };
    const release = () => {
      gesture = false;
    };
    root.addEventListener("pointerdown", hold);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);

    const follow = (frame: number) => {
      if (gesture) return;
      const { zoom } = playbackStore.getState();
      // Where the needle sits, by the same arithmetic the SDK's Playhead uses
      // to place it: the sidebar, plus the frame's offset into the lane, less
      // however far the lane is scrolled.
      const needle = sidebarWidth + frame * zoom - scroller.scrollLeft;
      const min = sidebarWidth + MARGIN_PX;
      const max = scroller.clientWidth - MARGIN_PX;
      // Collapsed, or too narrow for the two margins to leave any lane between
      // them: no useful place to put the needle, so leave the view alone.
      if (max <= min) return;
      if (needle > max) scroller.scrollLeft += needle - max;
      else if (needle < min) scroller.scrollLeft = Math.max(0, scroller.scrollLeft - (min - needle));
    };

    let last = playbackStore.getState().currentFrame;
    follow(last);

    // Zoom deliberately does not trigger a follow: the Timeline answers a zoom
    // by staging its own anchored `scrollLeft`, applied in an effect that runs
    // after this subscriber, so following here would just fight it.
    const unsubscribe = playbackStore.subscribe((state) => {
      if (state.currentFrame === last) return;
      last = state.currentFrame;
      follow(last);
    });

    return () => {
      unsubscribe();
      root.removeEventListener("pointerdown", hold);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
    };
  }, [sidebarWidth]);
}
