"use client";

import { useEffect } from "react";
import { useTimelineEngine } from "@elah/editor";
import { writeAutoSave } from "./autosave";

const INTERVAL_MS = 60_000;

/**
 * Snapshots the project every minute, and once more as the page goes away.
 *
 * Pass `enabled: false` while a restore is still on offer — otherwise the tick
 * would overwrite the very snapshot the banner is about to put back.
 *
 * `pagehide` runs alongside `beforeunload` because browsers skip beforeunload
 * when they discard a backgrounded tab outright.
 */
export function useAutoSave(enabled: boolean): void {
  const engine = useTimelineEngine();

  useEffect(() => {
    if (!enabled) return;

    const save = () => {
      writeAutoSave(engine);
    };

    /*
      The minute tick serializes the whole project and writes it to
      localStorage, both synchronous and both growing with the project. On a
      small project that measured 0.1ms, but it is the one piece of periodic
      work the editor does, and landing it inside a frame is what would turn a
      large project into a visible hitch mid-playback. Idle time costs nothing
      to ask for and takes it off the frame entirely.

      The timeout keeps a busy main thread from deferring it indefinitely, and
      the unload handlers stay synchronous -- the page is going away, so there
      is no idle period left to wait for.
    */
    const idle = typeof window.requestIdleCallback === "function";
    let handle: number | null = null;
    const tick = () => {
      if (!idle) {
        save();
        return;
      }
      handle = window.requestIdleCallback(save, { timeout: 2000 });
    };

    const timer = window.setInterval(tick, INTERVAL_MS);
    window.addEventListener("beforeunload", save);
    window.addEventListener("pagehide", save);

    return () => {
      window.clearInterval(timer);
      if (handle !== null && idle) window.cancelIdleCallback(handle);
      window.removeEventListener("beforeunload", save);
      window.removeEventListener("pagehide", save);
    };
  }, [enabled, engine]);
}
