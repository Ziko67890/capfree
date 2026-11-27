"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X, Download, Folder, Check } from "lucide-react";
import { exportVideo, useMediaLibrary, useTimelineEngine } from "@elah/editor";
import {
  fetchExportFolder,
  saveExport,
  type ExportAudio,
  type ExportFormat,
  type ExportResolution,
} from "../api";
import { Spinner } from "./chrome";
import { useToast } from "./toast";

interface ExportModalProps {
  onClose: () => void;
}

type ExportState = "idle" | "exporting" | "saving" | "done" | "error";

/* -------------------------------------------------------------------------
   The five controls.

   Each option carries everything the dialog needs to describe it and
   everything the encoder needs to produce it, in one place, so the summary
   line and the size estimate cannot drift from what actually gets sent.
   ------------------------------------------------------------------------- */

const RESOLUTIONS: { value: ExportResolution; label: string; width: number; height: number }[] = [
  { value: "480", label: "480p", width: 854, height: 480 },
  { value: "720", label: "720p", width: 1280, height: 720 },
  { value: "1080", label: "1080p", width: 1920, height: 1080 },
  { value: "2k", label: "2K", width: 2560, height: 1440 },
  { value: "4k", label: "4K", width: 3840, height: 2160 },
];

const FRAME_RATES = [24, 30, 60];

const FORMATS: {
  value: ExportFormat;
  label: string;
  /** What the summary calls the video codec. */
  codec: string;
  extension: string;
  /**
   * Roughly how much of H.264's bitrate this codec needs for the same look,
   * used only by the size estimate.
   */
  efficiency: number;
}[] = [
  { value: "mp4-h264", label: "MP4 — H.264", codec: "H.264", extension: ".mp4", efficiency: 1 },
  { value: "mp4-h265", label: "MP4 — H.265", codec: "H.265", extension: ".mp4", efficiency: 0.6 },
  { value: "webm-vp9", label: "WebM — VP9", codec: "VP9", extension: ".webm", efficiency: 0.65 },
];

const AUDIO_OPTIONS: { value: ExportAudio; label: string; codec: string; kbps: number }[] = [
  { value: "aac-192", label: "AAC — 192kbps", codec: "AAC", kbps: 192 },
  { value: "aac-128", label: "AAC — 128kbps", codec: "AAC", kbps: 128 },
  { value: "mp3-320", label: "MP3 — 320kbps", codec: "MP3", kbps: 320 },
];

const QUALITIES: { label: string; crf: number }[] = [
  { label: "Low", crf: 28 },
  { label: "Medium", crf: 23 },
  { label: "High", crf: 18 },
  { label: "Best", crf: 14 },
];

/* ------------------------------------------------------------------------- */

const DEFAULT_NAME = "Untitled Project";

/**
 * A rough size, in bytes, for a clip of this shape.
 *
 * x264 at CRF 23 lands near 0.08 bits per pixel on ordinary footage, and six
 * CRF steps roughly halve or double the bitrate, which is the whole model.
 * Content matters more than any of this -- a static talking head and a
 * confetti cannon at the same CRF are nowhere near each other -- so the
 * dialog shows the number with a "~" and never treats it as a promise.
 */
function estimateBytes(
  width: number,
  height: number,
  fps: number,
  crf: number,
  efficiency: number,
  audioKbps: number,
  seconds: number,
): number {
  const bitsPerPixel = 0.08 * Math.pow(2, (23 - crf) / 6);
  const videoBps = width * height * fps * bitsPerPixel * efficiency;
  return ((videoBps + audioKbps * 1000) * seconds) / 8;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** The API's own rule for a filename, mirrored so the path shown is the path used. */
function safeStem(raw: string): string {
  const cleaned = raw.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "");
  return cleaned.slice(0, 110) || "capfree-export";
}

/** Joins with whichever separator the folder already uses. */
function joinPath(folder: string, filename: string): string {
  if (!folder) return filename;
  const separator = folder.includes("\\") ? "\\" : "/";
  return `${folder.replace(/[\\/]+$/, "")}${separator}${filename}`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const SECTION_LABEL = "mb-2 block text-[11px] uppercase tracking-widest text-[#55555f]";

const FIELD_LABEL = "mb-1 block text-[11px] text-[var(--text-muted)]";

/**
 * appearance-none strips the native arrow, so the chevron is drawn as a
 * background image -- the one way to put a mark inside a <select> that the
 * pointer passes straight through to the control.
 */
const SELECT_CLASS =
  "w-full appearance-none rounded-lg border border-[var(--border)] bg-[var(--bg-panel2)] " +
  "bg-[length:10px] bg-[right_0.75rem_center] bg-no-repeat py-2 pl-3 pr-8 text-[13px] " +
  "text-white transition-colors hover:border-[#44444c] focus:border-[var(--accent)] " +
  "focus:outline-none disabled:cursor-not-allowed disabled:opacity-50";

const CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23888896' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E\")";

export function ExportModal({ onClose }: ExportModalProps) {
  const [state, setState] = useState<ExportState>("idle");
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");

  const [name, setName] = useState(DEFAULT_NAME);
  const [resolution, setResolution] = useState<ExportResolution>("1080");
  const [fps, setFps] = useState(30);
  const [format, setFormat] = useState<ExportFormat>("mp4-h264");
  const [audio, setAudio] = useState<ExportAudio>("aac-192");
  const [crf, setCrf] = useState(23);

  const [folder, setFolder] = useState("");
  const [editingFolder, setEditingFolder] = useState(false);
  const [savedPath, setSavedPath] = useState("");
  const [note, setNote] = useState("");

  const abortRef = useRef<AbortController | null>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const engine = useTimelineEngine();
  const library = useMediaLibrary();
  const toast = useToast();

  const busy = state === "exporting" || state === "saving";
  const settled = state === "done";

  const chosenResolution = RESOLUTIONS.find((r) => r.value === resolution) ?? RESOLUTIONS[2];
  const chosenFormat = FORMATS.find((f) => f.value === format) ?? FORMATS[0];
  const chosenAudio = AUDIO_OPTIONS.find((a) => a.value === audio) ?? AUDIO_OPTIONS[0];

  /*
    WebM carries neither AAC nor MP3, so the API swaps in Opus at the same
    bitrate. Saying so here keeps the summary honest about what will be in the
    file rather than repeating the dropdown back.
  */
  const audioCodecLabel = chosenFormat.extension === ".webm" ? "Opus" : chosenAudio.codec;

  const filename = `${safeStem(name)}${chosenFormat.extension}`;
  const savePath = joinPath(folder, filename);

  // Read off the engine once per open rather than subscribed: the timeline
  // cannot change while this dialog is over it.
  const project = useMemo(() => engine.getProject(), [engine]);
  const clipCount = useMemo(
    () => Object.values(project.clips).reduce((total, list) => total + list.length, 0),
    [project],
  );
  const durationSeconds = useMemo(() => {
    const frames = Object.values(project.clips)
      .flat()
      .reduce((end, clip) => Math.max(end, clip.startFrame + clip.durationFrames), 0);
    return project.fps > 0 ? frames / project.fps : 0;
  }, [project]);

  // A frame to show beside the name: the asset behind the first clip on the
  // timeline, whose thumbnail the media library already holds. Falling back to
  // any visual asset covers a timeline built from something without one, and
  // the gradient underneath covers an empty project.
  const thumbnail = useMemo(() => {
    const byId = new Map(library.assets.map((asset) => [asset.id, asset]));
    const earliest = Object.values(project.clips)
      .flat()
      .filter((clip) => clip.assetId && byId.get(clip.assetId)?.thumbnailUrl)
      .sort((a, b) => a.startFrame - b.startFrame)[0];
    if (earliest?.assetId) return byId.get(earliest.assetId)?.thumbnailUrl ?? null;
    return library.assets.find((a) => a.kind !== "audio" && a.thumbnailUrl)?.thumbnailUrl ?? null;
  }, [library.assets, project]);

  const estimate = formatBytes(
    estimateBytes(
      chosenResolution.width,
      chosenResolution.height,
      fps,
      crf,
      chosenFormat.efficiency,
      chosenAudio.kbps,
      durationSeconds,
    ),
  );

  const summary =
    `${chosenResolution.width}×${chosenResolution.height} · ` +
    `${chosenFormat.codec} + ${audioCodecLabel} · CRF ${crf}`;

  // Where the API would put it, so the path is real before anything is sent.
  useEffect(() => {
    let live = true;
    fetchExportFolder()
      .then((result) => {
        if (live) setFolder(result.folder);
      })
      .catch(() => {
        // Not fatal: the dialog still exports, it just cannot preview the
        // path. The success state shows the one the API actually chose.
        if (live) setFolder("");
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (editingFolder) folderInputRef.current?.focus();
  }, [editingFolder]);

  async function handleExport() {
    setState("exporting");
    setProgress(0);
    setErrorMsg("");
    setSavedPath("");
    setNote("");

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const current = engine.getProject();
      const hasClips = Object.values(current.clips).some((list) => list.length > 0);
      if (!hasClips) {
        const empty = "Nothing on the timeline yet. Add some clips first.";
        setErrorMsg(empty);
        toast(empty, "error");
        setState("error");
        return;
      }

      /*
        The browser's render is an intermediate: the API re-encodes it to the
        chosen codec, CRF and frame rate. What matters here is that it comes
        out in a container the chosen one can be made from without a needless
        conversion, and at no less than the target height.
      */
      const webm = chosenFormat.extension === ".webm";
      const blob = await exportVideo(current, {
        outputHeight: chosenResolution.height,
        container: webm ? "webm" : "mp4",
        videoCodec: webm ? "vp9" : "avc",
        audioCodec: webm ? "opus" : "aac",
        signal: ctrl.signal,
        onProgress: ({ frame, totalFrames }) => {
          setProgress(totalFrames > 0 ? Math.round((frame / totalFrames) * 100) : 0);
        },
      });

      const file = new File([blob], filename, { type: blob.type || "video/mp4" });

      /*
        Hand it to the API, which transcodes and files it where the user can
        find it. If that fails the render must not go with it, so the browser
        downloads it instead and the toast says why.
      */
      setState("saving");
      try {
        const saved = await saveExport(file, {
          fps,
          width: chosenResolution.width,
          height: chosenResolution.height,
          tracks: current.tracks.length,
          clips: clipCount,
          name: filename,
          resolution,
          quality: crf,
          format,
          audio,
          folder: folder || undefined,
        });
        setSavedPath(saved.path);
        // Read back off the file, so a transcode that did not happen cannot
        // be reported as though it had.
        if (saved.transcoded && saved.width && saved.height) {
          setNote(
            `${saved.width}×${saved.height} · ${saved.videoCodec ?? chosenFormat.codec}` +
              `${saved.audioCodec ? ` + ${saved.audioCodec}` : ""} · ${formatBytes(saved.bytes)}`,
          );
        } else if (!saved.transcoded) {
          setNote(`Saved as rendered — ${saved.warning ?? "the server did not re-encode it"}.`);
        }
        toast(`Exported to ${saved.path}`);
      } catch (saveErr) {
        downloadBlob(blob, filename);
        const why = saveErr instanceof Error ? saveErr.message : "the API did not answer";
        setSavedPath(filename);
        setNote(`Downloaded to your browser instead — ${why}`);
        toast(`Export saved to your downloads instead: ${why}`, "error");
      }

      setState("done");
    } catch (err: unknown) {
      if ((err as { name?: string }).name === "AbortError") {
        setState("idle");
        return;
      }
      console.error(err);
      const message = err instanceof Error ? err.message : "Export failed";
      setErrorMsg(message);
      toast(`Export failed: ${message}`, "error");
      setState("error");
    }
  }

  function handleCancel() {
    abortRef.current?.abort();
    setState("idle");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-[560px] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-panel)] shadow-2xl">
        {/* 1 — Header */}
        <div className="flex items-center justify-between px-5 pb-3 pt-4">
          <h2 className="text-[15px] font-semibold">
            <span className="text-white">Export</span>
            <span className="text-[var(--text-muted)]"> — </span>
            <span className="text-[var(--accent)]">CapFree</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--bg-panel2)] text-[var(--text-muted)] transition-colors hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex flex-col gap-4 px-5 pb-4">
          {/* 2 — Preview: thumbnail, editable name, what is in the project */}
          <div className="flex items-center gap-3 rounded-lg bg-[var(--bg-panel2)] p-3">
            <div
              className="h-10 w-[72px] shrink-0 overflow-hidden rounded bg-[linear-gradient(135deg,#2e2e36,#17171b)]"
              aria-hidden
            >
              {thumbnail && (
                // eslint-disable-next-line @next/next/no-img-element -- a blob: URL from the media library, not a routed asset
                <img src={thumbnail} alt="" className="h-full w-full object-cover" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={busy}
                aria-label="Project name"
                spellCheck={false}
                className="w-full truncate border-b border-b-transparent bg-transparent px-1 text-[14px] font-semibold text-white outline-none transition-colors focus:border-b-[var(--accent)] focus:bg-[rgba(91,94,244,0.06)] disabled:opacity-60"
              />
              <div className="mt-1 flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                <span>{formatDuration(durationSeconds)}</span>
                <span aria-hidden>·</span>
                <span>
                  {project.tracks.length} track{project.tracks.length === 1 ? "" : "s"}
                </span>
                <span className="rounded-full bg-[rgba(91,94,244,0.18)] px-2 py-0.5 text-[10px] font-medium text-[var(--accent)]">
                  {chosenFormat.codec} + {audioCodecLabel}
                </span>
              </div>
            </div>
          </div>

          {/* 3 — Video settings */}
          <section>
            <span className={SECTION_LABEL}>Video settings</span>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="export-resolution" className={FIELD_LABEL}>
                  Resolution
                </label>
                <select
                  id="export-resolution"
                  value={resolution}
                  disabled={busy}
                  onChange={(event) => setResolution(event.target.value as ExportResolution)}
                  className={SELECT_CLASS}
                  style={{ backgroundImage: CHEVRON }}
                >
                  {RESOLUTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="export-fps" className={FIELD_LABEL}>
                  Frame rate
                </label>
                <select
                  id="export-fps"
                  value={fps}
                  disabled={busy}
                  onChange={(event) => setFps(Number(event.target.value))}
                  className={SELECT_CLASS}
                  style={{ backgroundImage: CHEVRON }}
                >
                  {FRAME_RATES.map((rate) => (
                    <option key={rate} value={rate}>
                      {rate} fps
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="export-format" className={FIELD_LABEL}>
                  Format
                </label>
                <select
                  id="export-format"
                  value={format}
                  disabled={busy}
                  onChange={(event) => setFormat(event.target.value as ExportFormat)}
                  className={SELECT_CLASS}
                  style={{ backgroundImage: CHEVRON }}
                >
                  {FORMATS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="export-audio" className={FIELD_LABEL}>
                  Audio
                </label>
                <select
                  id="export-audio"
                  value={audio}
                  disabled={busy}
                  onChange={(event) => setAudio(event.target.value as ExportAudio)}
                  className={SELECT_CLASS}
                  style={{ backgroundImage: CHEVRON }}
                >
                  {AUDIO_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* 4 — Quality */}
          <section>
            <span className={SECTION_LABEL}>Quality</span>
            <div className="grid grid-cols-4 gap-2">
              {QUALITIES.map((option) => {
                const active = crf === option.crf;
                return (
                  <button
                    key={option.crf}
                    type="button"
                    disabled={busy}
                    aria-pressed={active}
                    onClick={() => setCrf(option.crf)}
                    className={`rounded-lg border py-2 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                      active
                        ? "border-[var(--accent)] bg-[rgba(91,94,244,0.18)] text-white"
                        : "border-[var(--border)] bg-[var(--bg-panel2)] text-[#888896] hover:border-[#44444c]"
                    }`}
                  >
                    <span className="block text-[13px] font-medium">{option.label}</span>
                    <span className="block text-[10px] opacity-70">CRF {option.crf}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 5 — Estimate */}
          <div className="flex items-center justify-between rounded-lg bg-[var(--bg-panel2)] px-3 py-2.5">
            <span className="text-[12px] text-[var(--text-muted)]">Estimated file size</span>
            <span className="text-[13px] font-medium text-white">~{estimate}</span>
          </div>

          {/* 6 — Where it goes */}
          <div className="flex items-center gap-2 rounded-lg bg-[var(--bg-panel2)] px-3 py-2.5">
            <Folder className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
            {editingFolder ? (
              <input
                ref={folderInputRef}
                value={folder}
                onChange={(event) => setFolder(event.target.value)}
                onBlur={() => setEditingFolder(false)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === "Escape") setEditingFolder(false);
                }}
                aria-label="Export folder"
                spellCheck={false}
                className="min-w-0 flex-1 rounded border border-[var(--accent)] bg-[rgba(91,94,244,0.06)] px-2 py-0.5 font-mono text-[11px] text-white outline-none"
              />
            ) : (
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-[var(--text-muted)]">
                {savePath || "Asking the API where exports go…"}
              </span>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => setEditingFolder((open) => !open)}
              className="shrink-0 text-[12px] font-medium text-[var(--accent)] transition-opacity hover:opacity-80 disabled:opacity-40"
            >
              {editingFolder ? "Done" : "Change"}
            </button>
          </div>

          {state === "error" && <p className="text-[13px] text-red-400">{errorMsg}</p>}

          {settled && note && <p className="break-all text-[11px] text-[var(--text-muted)]">{note}</p>}
        </div>

        {/* Progress — a thin rule above the footer while the render runs */}
        <div className="h-[2px] w-full bg-[var(--bg-panel2)]">
          {busy && (
            <div
              className="h-full bg-[var(--accent)] transition-[width] duration-150"
              // Indeterminate once the render is done and the upload and
              // transcode are in flight, which report no progress of their own.
              style={{ width: state === "saving" ? "100%" : `${progress}%` }}
            />
          )}
        </div>

        {/* 7 — Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-5 py-3.5">
          <span className="min-w-0 truncate text-[11px] text-[var(--text-muted)]">
            {state === "exporting"
              ? `Encoding… ${progress}%`
              : state === "saving"
                ? "Re-encoding on the server…"
                : settled && savedPath
                  ? savedPath
                  : summary}
          </span>

          <div className="flex shrink-0 items-center gap-2">
            {state === "exporting" ? (
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-lg border border-[var(--border)] px-3.5 py-2 text-[13px] text-[var(--text-muted)] transition-colors hover:text-white"
              >
                Cancel
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                disabled={state === "saving"}
                className="rounded-lg border border-[var(--border)] px-3.5 py-2 text-[13px] text-[var(--text-muted)] transition-colors hover:text-white disabled:opacity-40"
              >
                {settled ? "Close" : "Cancel"}
              </button>
            )}

            <button
              type="button"
              onClick={handleExport}
              disabled={busy || settled}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-semibold text-white transition-colors disabled:cursor-not-allowed ${
                settled
                  ? "bg-[#1f9a52] disabled:opacity-100"
                  : "bg-[var(--accent)] hover:bg-[#4c4fe0] disabled:opacity-70"
              }`}
            >
              {settled ? (
                <>
                  <Check className="h-4 w-4" />
                  <span className="max-w-[220px] truncate">Saved as {filename}</span>
                </>
              ) : busy ? (
                <>
                  <Spinner />
                  Exporting…
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Export
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
