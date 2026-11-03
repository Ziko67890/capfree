"use client";

import { sourceFrameFor } from "@elah/core";
import { importBlob, mediaLibraryStore, type Clip, type TimelineEngine } from "@elah/editor";

/** How long the still sits on the timeline. */
const FREEZE_SECONDS = 2;
const DECODE_TIMEOUT_MS = 15_000;

/**
 * The frame is decoded from the clip's own source media rather than read back
 * from the preview canvas: the renderer exposes no pixel readback, and reading
 * the GPU canvas would need preserveDrawingBuffer turned on in Preview. So the
 * still is the clean source frame — preview filters and other layers are not
 * baked into it.
 */
function mediaSrc(clip: Clip): string | null {
  const asset = clip.assetId ? mediaLibraryStore.getState().getAsset(clip.assetId) : undefined;
  return asset?.src ?? clip.src ?? null;
}

/** Decodes one frame of a video source into a PNG. */
async function grabFrame(src: string, seconds: number): Promise<Blob> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  // A remote source needs CORS permission or the canvas comes back tainted.
  if (!src.startsWith("blob:") && !src.startsWith("data:")) video.crossOrigin = "anonymous";

  try {
    await new Promise<void>((resolve, reject) => {
      let timer = 0;
      const settle = (error?: Error) => {
        window.clearTimeout(timer);
        if (error) reject(error);
        else resolve();
      };
      timer = window.setTimeout(
        () => settle(new Error("That clip took too long to decode.")),
        DECODE_TIMEOUT_MS,
      );

      video.addEventListener("error", () => settle(new Error("This clip's media could not be read.")), {
        once: true,
      });
      video.addEventListener("seeked", () => settle(), { once: true });
      video.addEventListener(
        "loadeddata",
        () => {
          // Seeking before the metadata lands is ignored, so wait for data.
          const limit = Number.isFinite(video.duration) ? Math.max(0, video.duration - 0.001) : seconds;
          const target = Math.min(seconds, limit);
          if (Math.abs(video.currentTime - target) < 0.001) settle();
          else video.currentTime = target;
        },
        { once: true },
      );

      video.src = src;
    });

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    if (canvas.width === 0 || canvas.height === 0) {
      throw new Error("This clip has no video frame to freeze.");
    }
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser could not rasterise the frame.");
    context.drawImage(video, 0, 0);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("That frame could not be encoded."));
      }, "image/png");
    });
  } finally {
    video.removeAttribute("src");
    video.load();
  }
}

/**
 * An unlocked video track with nothing across the still's span, so the freeze
 * lands exactly at the playhead instead of being pushed aside.
 */
function trackWithRoom(engine: TimelineEngine, startFrame: number, duration: number): string {
  const project = engine.getProject();
  for (const track of project.tracks) {
    if (track.kind !== "video" || track.locked) continue;
    const clips = project.clips[track.id] ?? [];
    const clash = clips.some(
      (clip) =>
        startFrame < clip.startFrame + clip.durationFrames && clip.startFrame < startFrame + duration,
    );
    if (!clash) return track.id;
  }
  return engine.addTrack("video", { name: "Freeze" }).id;
}

/** Drops a 2-second still of the clip's current frame at the playhead. */
export async function freezeFrameAt(
  engine: TimelineEngine,
  located: { clip: Clip; trackId: string },
  playhead: number,
  fps: number,
): Promise<void> {
  const { clip } = located;
  if (clip.type !== "video") throw new Error("Select a video clip to freeze.");

  const end = clip.startFrame + clip.durationFrames;
  if (playhead < clip.startFrame || playhead >= end) {
    throw new Error("Move the playhead inside the clip first.");
  }

  const src = mediaSrc(clip);
  if (!src) throw new Error("This clip has no media to freeze.");

  // sourceFrameFor honours both clip speed and any time remap.
  const seconds = Math.max(0, sourceFrameFor(clip, playhead) / fps);
  const blob = await grabFrame(src, seconds);
  const asset = await importBlob(new File([blob], "freeze.png", { type: "image/png" }), {
    name: "Freeze frame",
    kind: "image",
  });

  const duration = Math.max(1, Math.round(FREEZE_SECONDS * fps));
  const trackId = trackWithRoom(engine, playhead, duration);
  engine.addClip({
    type: "image",
    trackId,
    name: "Freeze frame",
    src: asset.src,
    assetId: asset.id,
    startFrame: playhead,
    durationFrames: duration,
  });
}
