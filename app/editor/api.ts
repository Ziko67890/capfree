/** CapFree API client. Base URL is NEXT_PUBLIC_API_URL, or the local API. */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface CaptionWord {
  word: string;
  start: number;
  end: number;
}

export interface CaptionLine {
  start: number;
  end: number;
  text: string;
  words?: CaptionWord[];
}

export interface FillerHit {
  word: string;
  start: number;
  end: number;
}

export interface FillerDetectResponse {
  language?: string;
  duration: number;
  fillers: FillerHit[];
  count: number;
}

export interface TrackBox {
  frame: number;
  x: number;
  y: number;
  width: number;
  height: number;
  found: boolean;
}

export interface TranslateResponse {
  source: string;
  target: string;
  text: string;
  lines: string[];
}

export interface CaptionsResponse {
  language?: string;
  duration?: number;
  captions: CaptionLine[];
}

export class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function readError(response: Response): Promise<string> {
  const text = await response.text();
  try {
    const data = JSON.parse(text) as { detail?: unknown };
    if (typeof data.detail === "string" && data.detail.trim()) return data.detail;
    if (Array.isArray(data.detail)) {
      const parts = data.detail.map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "msg" in item) return String(item.msg);
        return "";
      });
      const joined = parts.filter(Boolean).join(", ");
      if (joined) return joined;
    }
  } catch {
    if (text.trim()) return text.trim().slice(0, 240);
  }
  return `Request failed (${response.status})`;
}

async function postForm(path: string, body: FormData): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { method: "POST", body });
  } catch {
    throw new ApiError("Could not reach the API");
  }
  if (!response.ok) throw new ApiError(await readError(response));
  return response;
}

export async function requestCaptions(file: File, language?: string): Promise<CaptionsResponse> {
  const body = new FormData();
  body.append("file", file);
  body.append("format", "json");
  if (language && language !== "auto") body.append("language", language);
  const response = await postForm("/captions", body);
  return response.json() as Promise<CaptionsResponse>;
}

export async function requestSilenceRemoval(file: File): Promise<Blob> {
  const body = new FormData();
  body.append("file", file);
  const response = await postForm("/silence/remove", body);
  return response.blob();
}

export async function requestBackgroundRemoval(file: File): Promise<Blob> {
  const body = new FormData();
  body.append("file", file);
  const response = await postForm("/removebg", body);
  return response.blob();
}

export async function requestVocalIsolation(file: File): Promise<Blob> {
  const body = new FormData();
  body.append("file", file);
  const response = await postForm("/vocals/isolate", body);
  return response.blob();
}

export async function requestVocalMusic(file: File): Promise<Blob> {
  const body = new FormData();
  body.append("file", file);
  const response = await postForm("/vocals/music", body);
  return response.blob();
}

export async function requestFillerDetect(file: File, extra?: string, language?: string): Promise<FillerDetectResponse> {
  const body = new FormData();
  body.append("file", file);
  if (language) body.append("language", language);
  if (extra?.trim()) body.append("extra", extra.trim());
  const response = await postForm("/fillers/detect", body);
  return response.json() as Promise<FillerDetectResponse>;
}

export async function requestFillerRemove(
  file: File,
  segments?: Array<{ start: number; end: number }>,
): Promise<Blob> {
  const body = new FormData();
  body.append("file", file);
  if (segments && segments.length > 0) body.append("segments", JSON.stringify(segments));
  const response = await postForm("/fillers/remove", body);
  return response.blob();
}

export async function requestTrack(
  file: File,
  box: { x: number; y: number; width: number; height: number },
): Promise<TrackBox[]> {
  const body = new FormData();
  body.append("file", file);
  body.append("tracker", "csrt");
  body.append("x", String(Math.round(box.x)));
  body.append("y", String(Math.round(box.y)));
  body.append("width", String(Math.round(box.width)));
  body.append("height", String(Math.round(box.height)));
  const response = await postForm("/track", body);
  return response.json() as Promise<TrackBox[]>;
}

export async function requestTranslate(text: string, target: string, source = "auto"): Promise<TranslateResponse> {
  const body = new FormData();
  body.append("text", text);
  body.append("target", target);
  body.append("source", source);
  const response = await postForm("/translate", body);
  return response.json() as Promise<TranslateResponse>;
}

export async function requestBurnSubtitles(
  file: File,
  srt: string,
  options: { fontSize: number; position: string; font: string },
): Promise<Blob> {
  const body = new FormData();
  body.append("file", file);
  body.append("srt", srt);
  body.append("font_size", String(options.fontSize));
  body.append("position", options.position);
  body.append("font", options.font);
  const response = await postForm("/subtitles/burn", body);
  return response.blob();
}

export async function requestBeatSync(music: File, clips: File[]): Promise<Blob> {
  const body = new FormData();
  body.append("music", music);
  for (const clip of clips) body.append("clips", clip);
  body.append("width", "1920");
  body.append("height", "1080");
  body.append("fps", "30");
  const response = await postForm("/beat-sync", body);
  return response.blob();
}
