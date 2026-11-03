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
    const timer = window.setInterval(save, INTERVAL_MS);
    window.addEventListener("beforeunload", save);
    window.addEventListener("pagehide", save);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("beforeunload", save);
      window.removeEventListener("pagehide", save);
    };
  }, [enabled, engine]);
}
