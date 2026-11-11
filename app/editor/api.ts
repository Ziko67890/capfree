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

export interface AiPromptResponse {
  action: string;
  mood?: string;
  seconds?: number;
  text?: string;
  remaining?: number;
}

export interface RemoveBgJob {
  jobId: string;
  status: string;
  framesTotal: number;
  /** Playback rate of the output, which is sampled down from the source. */
  outputFps: number;
  /** How much of the source was taken, after the server's 30s / frame caps. */
  secondsProcessed: number;
  etaSeconds: number;
  note: string;
}

export interface RemoveBgStatus {
  jobId: string;
  status: "queued" | "running" | "encoding" | "done" | "error" | string;
  progress: number;
  framesDone: number;
  framesTotal: number;
  etaSeconds: number | null;
  error: string | null;
  outputPath: string | null;
  resultUrl: string | null;
}

export interface SilenceRange {
  start: number;
  end: number;
  duration: number;
}

export interface SilenceDetectResponse {
  duration: number;
  silences: SilenceRange[];
  totalSilence: number;
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

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  artistUrl: string | null;
  album: string | null;
  /** Seconds. */
  duration: number;
  bpm: number | null;
  genres: string[];
  licenseLabel: string;
  licenseUrl: string | null;
  requiresAttribution: boolean;
  attribution: string;
  provider: string;
  sourceUrl: string | null;
  previewUrl: string;
}

export interface MusicSearchResponse {
  query: string;
  /** Which provider answered. "freesound" means Openverse was unreachable. */
  source: string;
  page: number;
  pageCount: number;
  count: number;
  tracks: MusicTrack[];
}

export interface StockSticker {
  id: string;
  name: string;
  /** Small render for the grid. */
  previewUrl: string;
  /** Full-size render, which is what gets placed on the canvas. */
  url: string;
  width: number;
  height: number;
  tags: string[];
  author: string;
  sourceUrl: string;
}

export interface StockVideo {
  id: string;
  name: string;
  /** Seconds. */
  duration: number;
  url: string;
  width: number;
  height: number;
  /** Bytes. */
  size: number;
  thumbnail: string;
  tags: string[];
  author: string;
  sourceUrl: string;
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

/** Shown whenever the fetch itself fails, which usually means nothing is listening. */
const UNREACHABLE = `Could not reach the CapFree API at ${API_URL} — is the backend running?`;

async function postForm(path: string, body: FormData): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { method: "POST", body });
  } catch {
    throw new ApiError(UNREACHABLE);
  }
  if (!response.ok) throw new ApiError(await readError(response));
  return response;
}

async function getJson(path: string, params: Record<string, string>): Promise<unknown> {
  const query = new URLSearchParams(params).toString();
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}?${query}`);
  } catch {
    throw new ApiError(UNREACHABLE);
  }
  if (!response.ok) throw new ApiError(await readError(response));
  return response.json();
}

export async function requestCaptions(file: File, language?: string): Promise<CaptionsResponse> {
  const body = new FormData();
  body.append("file", file);
  body.append("format", "json");
  if (language && language !== "auto") body.append("language", language);
  const response = await postForm("/captions", body);
  return response.json() as Promise<CaptionsResponse>;
}

/** Finds the silent stretches without changing the file. */
export async function requestSilenceDetect(
  file: File,
  options?: { thresholdDb?: number; minDuration?: number },
): Promise<SilenceDetectResponse> {
  const body = new FormData();
  body.append("file", file);
  if (options?.thresholdDb !== undefined) body.append("threshold_db", String(options.thresholdDb));
  if (options?.minDuration !== undefined) body.append("min_duration", String(options.minDuration));
  const response = await postForm("/silence/detect", body);
  const data = (await response.json()) as {
    duration?: number;
    silences?: SilenceRange[];
    total_silence?: number;
  };
  return {
    duration: data.duration ?? 0,
    silences: data.silences ?? [],
    totalSilence: data.total_silence ?? 0,
  };
}

/**
 * Trims a file down. With no `segments` the API detects silence itself; with
 * them it cuts exactly those ranges, which is how the transcript editor turns
 * its cuts into a trimmed source.
 */
export async function requestSilenceRemoval(
  file: File,
  options?: { segments?: ReadonlyArray<{ start: number; end: number }>; padding?: number },
): Promise<Blob> {
  const body = new FormData();
  body.append("file", file);
  if (options?.segments && options.segments.length > 0) {
    body.append("segments", JSON.stringify(options.segments));
  }
  if (options?.padding !== undefined) body.append("padding", String(options.padding));
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


interface RawMusicTrack {
  id?: string;
  title?: string;
  artist?: string;
  artist_url?: string | null;
  album?: string | null;
  duration?: number;
  bpm?: number | null;
  genres?: string[];
  license_label?: string;
  license_url?: string | null;
  requires_attribution?: boolean;
  attribution?: string;
  provider?: string;
  source_url?: string | null;
  preview_url?: string;
}

/**
 * Royalty-free music search. The API talks to Openverse and filters the results
 * down to licences that allow both commercial use and adaptation.
 */
export async function searchMusic(query: string, page = 1): Promise<MusicSearchResponse> {
  const data = (await getJson("/music/search", {
    q: query,
    page: String(page),
    page_size: "20",
  })) as {
    query?: string;
    source?: string;
    page?: number;
    page_count?: number;
    count?: number;
    tracks?: RawMusicTrack[];
  };

  return {
    query: data.query ?? query,
    source: data.source ?? "openverse",
    page: data.page ?? page,
    pageCount: data.page_count ?? 0,
    count: data.count ?? 0,
    tracks: (data.tracks ?? [])
      .filter((item): item is RawMusicTrack & { id: string; preview_url: string } =>
        Boolean(item.id && item.preview_url),
      )
      .map((item) => ({
        id: item.id,
        title: item.title ?? "Untitled",
        artist: item.artist ?? "Unknown artist",
        artistUrl: item.artist_url ?? null,
        album: item.album ?? null,
        duration: item.duration ?? 0,
        bpm: item.bpm ?? null,
        genres: item.genres ?? [],
        licenseLabel: item.license_label ?? "Unknown licence",
        licenseUrl: item.license_url ?? null,
        requiresAttribution: item.requires_attribution !== false,
        attribution: item.attribution ?? "",
        provider: item.provider ?? "",
        sourceUrl: item.source_url ?? null,
        previewUrl: item.preview_url,
      })),
  };
}

/**
 * Pulls a track's bytes through the API. Going via the backend keeps the
 * track hosts' missing CORS headers from blocking the import.
 */
export async function requestMusicTrack(previewUrl: string): Promise<Blob> {
  const query = new URLSearchParams({ url: previewUrl }).toString();
  let response: Response;
  try {
    response = await fetch(`${API_URL}/music/download?${query}`);
  } catch {
    throw new ApiError(UNREACHABLE);
  }
  if (!response.ok) throw new ApiError(await readError(response));
  return response.blob();
}


interface RawSticker {
  id?: string;
  name?: string;
  preview_url?: string;
  url?: string;
  width?: number;
  height?: number;
  tags?: string[];
  author?: string;
  source_url?: string;
}

interface RawVideo {
  id?: string;
  name?: string;
  duration?: number;
  url?: string;
  width?: number;
  height?: number;
  size?: number;
  thumbnail?: string;
  tags?: string[];
  author?: string;
  source_url?: string;
}

/**
 * Pixabay vector search, proxied so the key stays on the server. Everything it
 * returns is free for commercial use with no credit required.
 */
export async function searchStickers(query: string, perPage = 30): Promise<StockSticker[]> {
  const data = (await getJson("/media/stickers", {
    q: query,
    per_page: String(perPage),
  })) as { stickers?: RawSticker[] };

  return (data.stickers ?? [])
    .filter((item): item is RawSticker & { id: string; url: string } =>
      Boolean(item.id && item.url),
    )
    .map((item) => ({
      id: item.id,
      name: (item.name ?? "").trim() || "Sticker",
      previewUrl: item.preview_url ?? item.url,
      url: item.url,
      width: item.width ?? 0,
      height: item.height ?? 0,
      tags: item.tags ?? [],
      author: item.author ?? "",
      sourceUrl: item.source_url ?? "",
    }));
}

/**
 * Pulls a stock clip's bytes through the API. cdn.pixabay.com sends no CORS
 * header at all, so a direct fetch from the renderer is always blocked -- this
 * is the only way the engine gets to own the bytes.
 */
export async function requestStockVideo(videoUrl: string): Promise<Blob> {
  const query = new URLSearchParams({ url: videoUrl }).toString();
  let response: Response;
  try {
    response = await fetch(`${API_URL}/media/proxy-video?${query}`);
  } catch {
    throw new ApiError(UNREACHABLE);
  }
  if (!response.ok) throw new ApiError(await readError(response));
  return response.blob();
}

/** Pixabay stock footage search. The API caps each clip at 1080p. */
export async function searchStockVideos(query: string, perPage = 20): Promise<StockVideo[]> {
  const data = (await getJson("/media/videos", {
    q: query,
    per_page: String(perPage),
  })) as { videos?: RawVideo[] };

  return (data.videos ?? [])
    .filter((item): item is RawVideo & { id: string; url: string } => Boolean(item.id && item.url))
    .map((item) => ({
      id: item.id,
      name: (item.name ?? "").trim() || "Stock clip",
      duration: item.duration ?? 0,
      url: item.url,
      width: item.width ?? 0,
      height: item.height ?? 0,
      size: item.size ?? 0,
      thumbnail: item.thumbnail ?? "",
      tags: item.tags ?? [],
      author: item.author ?? "",
      sourceUrl: item.source_url ?? "",
    }));
}

/**
 * Resolves one editing prompt. The OpenAI key and the free-tier limit both live
 * on the server, so nothing here needs configuring by the user.
 *
 * A 429 is the daily limit and carries the message to show; it arrives as an
 * ApiError like any other failure.
 */
export async function requestAiPrompt(
  body: { prompt: string; duration: number; clip_count: number },
  signal?: AbortSignal,
): Promise<AiPromptResponse> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/ai/prompt`, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError(UNREACHABLE);
  }
  if (!response.ok) throw new ApiError(await readError(response));
  return response.json() as Promise<AiPromptResponse>;
}

/**
 * Queues background removal and returns at once with a job id. The work is
 * minutes of CPU per clip, so it is polled rather than awaited.
 */
export async function requestRemoveVideoBg(file: File, model = "u2net"): Promise<RemoveBgJob> {
  const body = new FormData();
  body.append("file", file);
  body.append("model", model);
  const response = await postForm("/video/remove-bg", body);
  const data = (await response.json()) as {
    job_id?: string;
    status?: string;
    frames_total?: number;
    output_fps?: number;
    seconds_processed?: number;
    eta_seconds?: number;
    note?: string;
  };
  if (!data.job_id) throw new ApiError("The API did not return a job id");
  return {
    jobId: data.job_id,
    status: data.status ?? "queued",
    framesTotal: data.frames_total ?? 0,
    outputFps: data.output_fps ?? 0,
    secondsProcessed: data.seconds_processed ?? 0,
    etaSeconds: data.eta_seconds ?? 0,
    note: data.note ?? "",
  };
}

export async function requestRemoveVideoBgStatus(jobId: string): Promise<RemoveBgStatus> {
  const data = (await getJson(`/video/remove-bg/${encodeURIComponent(jobId)}/status`, {})) as {
    job_id?: string;
    status?: string;
    progress?: number;
    frames_done?: number;
    frames_total?: number;
    eta_seconds?: number | null;
    error?: string | null;
    output_path?: string | null;
    result_url?: string | null;
  };
  return {
    jobId: data.job_id ?? jobId,
    status: data.status ?? "queued",
    progress: data.progress ?? 0,
    framesDone: data.frames_done ?? 0,
    framesTotal: data.frames_total ?? 0,
    etaSeconds: data.eta_seconds ?? null,
    error: data.error ?? null,
    outputPath: data.output_path ?? null,
    resultUrl: data.result_url ?? null,
  };
}

/** The finished transparent WebM. */
export async function requestRemoveVideoBgResult(jobId: string): Promise<Blob> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/video/remove-bg/${encodeURIComponent(jobId)}/result`);
  } catch {
    throw new ApiError(UNREACHABLE);
  }
  if (!response.ok) throw new ApiError(await readError(response));
  return response.blob();
}

/** Abandons a job so the server stops cutting frames and drops the output. */
export async function cancelRemoveVideoBg(jobId: string): Promise<void> {
  try {
    await fetch(`${API_URL}/video/remove-bg/${encodeURIComponent(jobId)}`, { method: "DELETE" });
  } catch {
    /* Best effort: the job is daemon-threaded and ages out on its own. */
  }
}
