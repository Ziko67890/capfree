"use client";

import { useEffect } from "react";
import { playbackStore, splitClipAtPlayhead, tracksStore, useTimelineEngine } from "@elah/editor";
import { playheadFrame, seekFrame } from "./captionActions";
import {
  copySelection,
  deleteSelection,
  duplicateSelection,
  pasteSelection,
  SPLIT_MESSAGE,
} from "./clipEdit";
import { useToast } from "./components/toast";

/** How far J and L jump. */
const JUMP_SECONDS = 5;

/** Keys that scrub, and so may usefully repeat while held. */
const REPEATABLE = new Set(["j", "l"]);

/** A keystroke aimed at a field belongs to that field, not to the timeline. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/**
 * Global editor shortcuts.
 *
 * Ctrl is read as "Ctrl or Cmd" so the same bindings work on the macOS build.
 * Anything handled here is prevented, because the browser has its own ideas
 * about Space, Backspace and Ctrl+D.
 */
export function useShortcuts(fps: number, enabled = true): void {
  const engine = useTimelineEngine();
  const toast = useToast();

  useEffect(() => {
    if (!enabled) return;

    /** Helpers return a message on refusal and null when they did the work. */
    function report(failure: string | null) {
      if (failure) toast(failure, "error");
    }

    function jump(seconds: number) {
      const total = Math.max(0, tracksStore.getState().totalFrames);
      const next = playheadFrame() + Math.round(seconds * fps);
      seekFrame(Math.min(Math.max(0, next), total));
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || isTyping(event.target)) return;
      // Mid-composition keystrokes belong to the IME.
      if (event.isComposing) return;

      const key = event.key.toLowerCase();
      if (event.repeat && !REPEATABLE.has(key)) return;

      const playback = playbackStore.getState();
      const mod = event.ctrlKey || event.metaKey;

      if (mod) {
        switch (key) {
          case "z":
            event.preventDefault();
            if (event.shiftKey) engine.redo();
            else engine.undo();
            return;
          case "y":
            event.preventDefault();
            engine.redo();
            return;
          case "c":
            event.preventDefault();
            report(copySelection(engine));
            return;
          case "v":
            event.preventDefault();
            report(pasteSelection(engine, playheadFrame()));
            return;
          case "d":
            event.preventDefault();
            report(duplicateSelection(engine));
            return;
          default:
            return;
        }
      }

      if (event.altKey) return;

      switch (key) {
        case " ":
          event.preventDefault();
          playback.togglePlayPause();
          return;
        case "k":
          event.preventDefault();
          playback.pause();
          return;
        case "j":
          event.preventDefault();
          jump(-JUMP_SECONDS);
          return;
        case "l":
          event.preventDefault();
          jump(JUMP_SECONDS);
          return;
        case "s": {
          event.preventDefault();
          const result = splitClipAtPlayhead(engine);
          report(result.ok ? null : (SPLIT_MESSAGE[result.reason] ?? "Could not split this clip."));
          return;
        }
        case "delete":
        case "backspace":
          event.preventDefault();
          report(deleteSelection(engine));
          return;
        default:
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, engine, fps, toast]);
}
