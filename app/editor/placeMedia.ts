import { importBlob, importUrl, insertMediaAsset, playbackStore, type TimelineEngine } from "@elah/editor";
import { selectClip } from "./clipEdit";

/** Short preview tone so a catalog card can land on the timeline as a real audio clip. */
export function toneWav(seconds: number, frequency: number): Blob {
  const sampleRate = 8000;
  const length = Math.max(1, Math.floor(sampleRate * Math.min(seconds, 12)));
  const buffer = new ArrayBuffer(44 + length * 2);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + length * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, length * 2, true);
  for (let i = 0; i < length; i += 1) {
    const edge = Math.min(1, i / 180, (length - i) / 180);
    const sample = Math.sin((2 * Math.PI * frequency * i) / sampleRate) * 0.18 * edge;
    view.setInt16(44 + i * 2, Math.round(sample * 0x7fff), true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

export function emojiPng(emoji: string): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Could not draw the sticker"));
  ctx.clearRect(0, 0, 256, 256);
  ctx.font = "170px Segoe UI Emoji, Apple Color Emoji, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji, 128, 140);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not draw the sticker"))), "image/png");
  });
}

export function blackPng(): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Could not draw the avatar clip"));
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, 16, 16);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not draw the avatar clip"))), "image/png");
  });
}

export async function addAudioUrl(
  engine: TimelineEngine,
  url: string,
  name: string,
  startFrame?: number,
): Promise<string | null> {
  try {
    const response = await fetch(url, { mode: "cors" });
    if (response.ok) return addAudioBlob(engine, await response.blob(), name, startFrame);
  } catch {
    /* Mixkit allows playback; some origins omit CORS on fetch. */
  }
  const asset = await importUrl(url, { name, kind: "audio" });
  const result = await insertMediaAsset(
    engine,
    asset.id,
    startFrame === undefined ? undefined : { desiredStartFrame: startFrame },
  );
  if (!result.ok || result.clipIds.length === 0) return null;
  engine.updateClip(result.clipIds[0], result.trackId, { name });
  selectClip(result.clipIds[0]);
  return result.clipIds[0];
}

/** MediaRecorder hands back webm or mp4 as often as it does mp3. */
function audioExtension(type: string): string {
  if (type.includes("wav")) return "wav";
  if (type.includes("webm")) return "webm";
  if (type.includes("ogg")) return "ogg";
  if (type.includes("mp4") || type.includes("m4a") || type.includes("aac")) return "m4a";
  return "mp3";
}

export async function addAudioBlob(
  engine: TimelineEngine,
  blob: Blob,
  name: string,
  startFrame?: number,
  targetTrackId?: string,
): Promise<string | null> {
  const type = blob.type || "audio/mpeg";
  const file = new File([blob], `${name}.${audioExtension(type)}`, { type });
  const asset = await importBlob(file, { name, kind: "audio" });
  const result = await insertMediaAsset(engine, asset.id, {
    ...(startFrame === undefined ? {} : { desiredStartFrame: startFrame }),
    ...(targetTrackId === undefined ? {} : { targetTrackId }),
  });
  if (!result.ok || result.clipIds.length === 0) return null;
  engine.updateClip(result.clipIds[0], result.trackId, { name });
  selectClip(result.clipIds[0]);
  return result.clipIds[0];
}

export async function addImageBlob(
  engine: TimelineEngine,
  blob: Blob,
  name: string,
  durationFrames: number,
): Promise<string | null> {
  const type = blob.type || (name.toLowerCase().endsWith(".gif") ? "image/gif" : "image/png");
  const ext = type.includes("gif") ? "gif" : "png";
  const file = new File([blob], `${name}.${ext}`, { type });
  const asset = await importBlob(file, { name, kind: "image" });
  const result = await insertMediaAsset(engine, asset.id, {
    desiredStartFrame: playbackStore.getState().currentFrame,
  });
  if (!result.ok || result.clipIds.length === 0) return null;
  engine.updateClip(result.clipIds[0], result.trackId, {
    name,
    durationFrames: Math.max(1, durationFrames),
  });
  selectClip(result.clipIds[0]);
  return result.clipIds[0];
}

/** Fetch a remote image/GIF and import it so the engine owns the bytes (export-safe). */
export async function addImageUrl(
  engine: TimelineEngine,
  url: string,
  name: string,
  durationFrames: number,
): Promise<string | null> {
  try {
    const response = await fetch(url, { mode: "cors" });
    if (response.ok) return addImageBlob(engine, await response.blob(), name, durationFrames);
  } catch {
    /* Some CDNs omit CORS; Elah can still import the URL. */
  }
  const asset = await importUrl(url, { name, kind: "image" });
  const result = await insertMediaAsset(engine, asset.id, {
    desiredStartFrame: playbackStore.getState().currentFrame,
  });
  if (!result.ok || result.clipIds.length === 0) return null;
  engine.updateClip(result.clipIds[0], result.trackId, {
    name,
    durationFrames: Math.max(1, durationFrames),
  });
  selectClip(result.clipIds[0]);
  return result.clipIds[0];
}
