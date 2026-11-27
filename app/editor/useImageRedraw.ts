"use client";

import { useEffect, useRef } from "react";
import { useResolvedScene, warmImageSrc, type PreviewHandle } from "@elah/editor";

/**
 * Making image clips appear in the paused preview.
 *
 * The renderer loads an image asynchronously and draws nothing until the
 * bitmap arrives -- which is correct -- but nothing asks it to draw again once
 * it has. Every other async layer is wired to a notifier for exactly this:
 * `createLayerSet` builds a `featureReady` callback that queues a redraw of the
 * last scene, and hands it to the lazily-loaded layers, while the sequence and
 * roto-mask layers get their own `onFrameReady`. The image layer is
 * constructed as a bare `new ImageLayer()` and is given none of them, so the
 * frame it missed is never redrawn.
 *
 * While the transport is running that is invisible: the next frame draws a
 * moment later and the picture appears. Paused -- which is how a still is
 * usually looked at -- the canvas simply stays black, which is why an imported
 * photo, a sticker and the AI outro card all showed as nothing until playback
 * was started. The exported file was always correct, because an export renders
 * every frame in sequence with the bitmap already in hand.
 *
 * This supplies the missing notification from outside the SDK, using only its
 * public surface: watch the scene's image sources, wait for each new one to
 * decode, then hand the renderer the current scene again. The second draw
 * finds the bitmap ready and uploads it.
 *
 * Sources are remembered across the session, so returning to a clip already
 * seen costs nothing. The browser's own image cache makes the decode
 * immediate in that case anyway.
 */
export function useImageRedraw(previewRef: React.RefObject<PreviewHandle | null>): void {
  const scene = useResolvedScene();
  // The scene the redraw should use is whatever is current when the image
  // finally resolves, not the one that was on screen when it started loading.
  // Written after each render rather than during one: a ref assigned in the
  // render body is read back before React has committed it.
  const sceneRef = useRef(scene);
  useEffect(() => {
    sceneRef.current = scene;
  });

  const settled = useRef(new Set<string>());

  const sources = scene.images
    .map((image) => image.src)
    .filter(Boolean)
    .sort()
    .join("\n");

  useEffect(() => {
    const pending = sources.split("\n").filter((src) => src && !settled.current.has(src));
    if (pending.length === 0) return;

    let live = true;
    for (const src of pending) {
      // Marked before the load, not after: a source that fails to decode
      // should not be retried on every scene change.
      settled.current.add(src);
      // Warm the renderer's own cache with the same key it will ask for, so
      // its load resolves from there rather than fetching a second time.
      warmImageSrc(src);

      const image = new Image();
      image.crossOrigin = "anonymous";
      const redraw = () => {
        if (!live) return;
        previewRef.current?.getRenderer()?.render(sceneRef.current);
      };
      image.onload = redraw;
      // A failure still redraws: the frame is black either way, and this keeps
      // one broken source from stalling the others behind it.
      image.onerror = redraw;
      image.src = src;
    }

    return () => {
      live = false;
    };
  }, [sources, previewRef]);
}
