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
