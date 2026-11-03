import {
  importBlob,
  mediaLibraryStore,
  selectionStore,
  type Clip,
  type TimelineEngine,
} from "@elah/editor";

type LocatedClip = { clip: Clip; trackId: string };

function mimeFor(type: Clip["type"]): string {
  if (type === "image") return "image/png";
  if (type === "audio") return "audio/mpeg";
  return "video/mp4";
}

/** The media library keeps the uploaded bytes behind the clip's src URL. */
export async function fileFromClip(clip: Clip): Promise<File> {
  const library = mediaLibraryStore.getState();
  const asset = clip.assetId ? library.getAsset(clip.assetId) : undefined;
  const src = asset?.src ?? clip.src;
  if (!src) throw new Error("This clip has no media to upload");

  let blob: Blob;
  try {
    const response = await fetch(src);
    if (!response.ok) throw new Error("unreadable");
    blob = await response.blob();
  } catch {
    throw new Error("Could not read this clip's file");
  }

  const name = asset?.name || clip.name || "clip";
  return new File([blob], name, { type: blob.type || mimeFor(clip.type) });
}

function selectedLocated(engine: TimelineEngine): LocatedClip[] {
  const hits: LocatedClip[] = [];
  for (const id of selectionStore.getState().selectedClipIds) {
    const found = engine.findClip(id);
    if (found) hits.push(found);
  }
  return hits;
}

/** Selected video clip, or the first video on the timeline. */
export function targetVideoClip(engine: TimelineEngine): LocatedClip | null {
  const selected = selectedLocated(engine).find((hit) => hit.clip.type === "video" && hit.clip.src);
  if (selected) return selected;

  const project = engine.getProject();
  for (const track of project.tracks) {
    if (track.kind !== "video") continue;
    const clip = (project.clips[track.id] ?? []).find((item) => item.type === "video" && item.src);
    if (clip) return { clip, trackId: track.id };
  }
  return null;
}

/** Selected video or audio clip, otherwise the first video on the timeline. */
export function targetMediaClip(engine: TimelineEngine): LocatedClip | null {
  const selected = selectedLocated(engine).find(
    (hit) => (hit.clip.type === "video" || hit.clip.type === "audio") && Boolean(hit.clip.src || hit.clip.assetId),
  );
  if (selected) return selected;
  return targetVideoClip(engine);
}

export function selectedImageClip(engine: TimelineEngine): LocatedClip | null {
  return selectedLocated(engine).find((hit) => hit.clip.type === "image" && hit.clip.src) ?? null;
}

export function selectedVisualClips(engine: TimelineEngine): LocatedClip[] {
  return selectedLocated(engine).filter(
    (hit) => (hit.clip.type === "video" || hit.clip.type === "image") && hit.clip.src,
  );
}

/**
 * Swaps a clip's media but leaves its position and trim alone. Used when the
 * replacement is the same footage re-rendered (burned-in captions), where
 * restoring the full source length would overlap whatever follows the clip.
 */
export async function swapClipMedia(
  engine: TimelineEngine,
  located: LocatedClip,
  file: File,
  kind: "video" | "image",
): Promise<void> {
  const asset = await importBlob(file, { name: file.name, kind });
  engine.updateClip(located.clip.id, located.trackId, {
    src: asset.src,
    assetId: asset.id,
    name: asset.name,
  });
}

/** Abutting pieces of one source, head first — what cutting leaves behind. */
function clipRun(engine: TimelineEngine, located: LocatedClip, limit: number): Clip[] {
  const onTrack = [...engine.getClipsOnTrack(located.trackId)].sort(
    (a, b) => a.startFrame - b.startFrame,
  );
  const index = onTrack.findIndex((clip) => clip.id === located.clip.id);
  if (index === -1) return [];

  const run = [onTrack[index]];
  for (let i = index + 1; i < onTrack.length && run.length < limit; i += 1) {
    const previous = run[run.length - 1];
    const next = onTrack[i];
    const sameSource = located.clip.assetId
      ? next.assetId === located.clip.assetId
      : next.src === located.clip.src;
    // A gap, a different source, or source time running backwards all mean the
    // next clip is its own thing rather than the tail of this cut-up one.
    if (!sameSource) break;
    if (next.startFrame !== previous.startFrame + previous.durationFrames) break;
    if (next.sourceStartFrame <= previous.sourceStartFrame) break;
    run.push(next);
  }
  return run;
}

/**
 * Collapses an abutting run of pieces of one source into a single clip on the
 * new file. Cutting from the transcript splits a clip into pieces; a trimmed
 * re-render is those pieces joined back up, so it takes the whole span they
 * held between them and the surrounding clips never move.
 */
export async function mergeClipRunMedia(
  engine: TimelineEngine,
  located: LocatedClip,
  file: File,
  options: { pieces: number; sourceStartFrame: number; fps: number },
): Promise<void> {
  const run = clipRun(engine, located, Math.max(1, options.pieces));
  if (run.length === 0) throw new Error("That clip is no longer on the timeline");

  const asset = await importBlob(file, { name: file.name, kind: "video" });
  const frames = run.reduce((total, clip) => total + clip.durationFrames, 0);
  const assetFrames =
    Number.isFinite(asset.durationSec) && asset.durationSec > 0
      ? Math.max(1, Math.round(asset.durationSec * options.fps))
      : undefined;
  const updates: Partial<Clip> = {
    src: asset.src,
    assetId: asset.id,
    name: asset.name,
    durationFrames: frames,
    sourceStartFrame: Math.max(0, options.sourceStartFrame),
    sourceDurationFrames: frames,
    ...(assetFrames !== undefined ? { assetFrames } : {}),
  };

  engine.batch(() => {
    // The tails go first: growing the head into their span would overlap them.
    for (const piece of run.slice(1)) engine.removeClip(piece.id, located.trackId);
    engine.updateClip(located.clip.id, located.trackId, updates);
  }, "Burn captions");
}

/** Point a clip at a newly imported file. Video length follows the new media. */
export async function replaceClipFile(
  engine: TimelineEngine,
  located: LocatedClip,
  file: File,
  kind: "video" | "image",
  fps: number,
): Promise<void> {
  const asset = await importBlob(file, { name: file.name, kind });
  const updates: Partial<Clip> = {
    src: asset.src,
    assetId: asset.id,
    name: asset.name,
  };
  if (kind === "video") {
    const frames = Math.max(1, Math.round(asset.durationSec * fps));
    updates.durationFrames = frames;
    updates.sourceDurationFrames = frames;
    updates.sourceStartFrame = 0;
  }
  engine.updateClip(located.clip.id, located.trackId, updates);
}
