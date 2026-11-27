"use client";

import { useState, useRef } from "react";
import { X, Download } from "lucide-react";
import { exportVideo, useTimelineEngine } from "@elah/editor";
import { saveExport, type ExportQuality, type ExportResolution } from "../api";
import { Spinner } from "./chrome";
import { useToast } from "./toast";

interface ExportModalProps {
  onClose: () => void;
}

type ExportState = "idle" | "exporting" | "saving" | "done" | "error";

/**
 * The two dropdowns. Both are named rather than numeric because the API takes
 * the name and owns the mapping -- the CRFs here are labels, not the values
 * that get sent, so the dialog cannot drift from what the encoder does.
 */
const RESOLUTIONS: { value: ExportResolution; label: string }[] = [
  { value: "1080", label: "1080p (1920 × 1080)" },
  { value: "720", label: "720p (1280 × 720)" },
  { value: "480", label: "480p (854 × 480)" },
];

const QUALITIES: { value: ExportQuality; label: string }[] = [
  { value: "high", label: "High — CRF 18, visually lossless" },
  { value: "medium", label: "Medium — CRF 23" },
  { value: "low", label: "Low — CRF 28, smallest file" },
];

/**
 * What the encoder will actually write, by the rule the SDK uses internally:
 * the picked number is the *short* edge, so a portrait project exports 1080
 * wide rather than 1080 tall.
 */
function outputSize(stage: { width: number; height: number }, shortEdge: number) {
  const scale = shortEdge / Math.min(stage.width, stage.height);
  return {
    width: Math.round((stage.width * scale) / 2) * 2,
    height: Math.round((stage.height * scale) / 2) * 2,
  };
}

const selectClass =
  "w-full rounded-lg border border-[#2a2a2e] bg-[#2a2a2e] px-3 py-2 text-sm text-white " +
  "transition-colors hover:border-[#444] focus:border-[var(--accent)] focus:outline-none " +
  "disabled:cursor-not-allowed disabled:opacity-50";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function ExportModal({ onClose }: ExportModalProps) {
  const [state, setState] = useState<ExportState>("idle");
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [resolution, setResolution] = useState<ExportResolution>("1080");
  const [quality, setQuality] = useState<ExportQuality>("high");
  const [outcome, setOutcome] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const abortRef = useRef<AbortController | null>(null);
  const engine = useTimelineEngine();
  const toast = useToast();
  // Neither dropdown may change once the render it describes is under way.
  const busy = state === "exporting" || state === "saving";

  async function handleExport() {
    setState("exporting");
    setProgress(0);
    setErrorMsg("");
    setOutcome("");
    setNote("");

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const outputHeight = resolution === "1080" ? 1080 : resolution === "720" ? 720 : 480;

    try {
      const project = engine.getProject();
      // clips is a Record<trackId, Clip[]>; check if any track has clips
      const hasClips = Object.values(project.clips).some((c) => c.length > 0);

      if (!hasClips) {
        const empty = "Nothing on the timeline yet. Add some clips first.";
        setErrorMsg(empty);
        toast(empty, "error");
        setState("error");
        return;
      }

      const blob = await exportVideo(project, {
        outputHeight,
        container: "mp4",
        videoCodec: "avc",
        audioCodec: "aac",
        signal: ctrl.signal,
        onProgress: ({ frame, totalFrames: tf }) => {
          setProgress(Math.round((frame / tf) * 100));
        },
      });

      const filename = `capfree-export-${Date.now()}.mp4`;
      const file = new File([blob], filename, { type: blob.type || "video/mp4" });
      const size = outputSize(project.stage, outputHeight);

      /*
        Hand the finished file to the API: it re-encodes to CapFree's one
        profile, puts the result in a folder the user can find, and reports
        the path it chose. If that fails the render must not go with it, so
        the browser downloads it instead and the toast says so -- the file is
        still H.264/AAC, just not normalised.
      */
      setState("saving");
      try {
        const saved = await saveExport(file, {
          fps: project.fps,
          width: size.width,
          height: size.height,
          tracks: project.tracks.length,
          clips: Object.values(project.clips).reduce((total, list) => total + list.length, 0),
          resolution,
          quality,
        });
        setOutcome(`Saved to ${saved.path}`);
        // What the API read back off the finished file, not what was asked
        // for -- so a transcode that silently did not happen cannot be
        // reported as though it had.
        if (saved.transcoded && saved.width && saved.height) {
          setNote(
            `${saved.width}×${saved.height} · ${saved.videoCodec ?? "h264"}` +
              `${saved.audioCodec ? ` + ${saved.audioCodec}` : ""}` +
              `${saved.crf ? ` · CRF ${saved.crf}` : ""}`,
          );
        } else if (!saved.transcoded) {
          setNote(`Saved as rendered — ${saved.warning ?? "the server did not re-encode it"}.`);
        }
        toast(`Exported to ${saved.path}`);
      } catch (saveErr) {
        downloadBlob(blob, filename);
        const why = saveErr instanceof Error ? saveErr.message : "the API did not answer";
        setOutcome(`Downloaded ${filename} — could not reach the export folder.`);
        toast(`Export saved to your downloads instead: ${why}`, "error");
      }

      setState("done");
    } catch (err: unknown) {
      if ((err as { name?: string }).name === "AbortError") {
        setState("idle");
      } else {
        console.error(err);
        const message = err instanceof Error ? err.message : "Export failed";
        setErrorMsg(message);
        toast(`Export failed: ${message}`, "error");
        setState("error");
      }
    }
  }

  function handleCancel() {
    abortRef.current?.abort();
    setState("idle");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-[#18181c] rounded-2xl shadow-2xl border border-[#2a2a2e] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2a2a2e]">
          <h2 className="font-semibold text-white">Export video</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-md text-[#888] hover:text-white hover:bg-[#2a2a2e] flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 flex flex-col gap-4">
          {/* Resolution */}
          <div>
            <label htmlFor="export-resolution" className="mb-1.5 block text-xs text-[#888]">
              Resolution
            </label>
            <select
              id="export-resolution"
              value={resolution}
              disabled={busy}
              onChange={(event) => setResolution(event.target.value as ExportResolution)}
              className={selectClass}
            >
              {RESOLUTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Quality */}
          <div>
            <label htmlFor="export-quality" className="mb-1.5 block text-xs text-[#888]">
              Quality
            </label>
            <select
              id="export-quality"
              value={quality}
              disabled={busy}
              onChange={(event) => setQuality(event.target.value as ExportQuality)}
              className={selectClass}
            >
              {QUALITIES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Format note */}
          <p className="text-xs text-[#555]">Format: MP4 (H.264 + AAC) · Free · No watermark</p>

          {/* Progress bar */}
          {state === "exporting" && (
            <div>
              <div className="flex justify-between text-xs text-[#888] mb-1.5">
                <span>Encoding…</span>
                <span>{progress}%</span>
              </div>
              <div className="h-1.5 bg-[#2a2a2e] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#ffffff] rounded-full transition-all duration-150"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {state === "saving" && (
            <span className="flex items-center gap-2 text-xs text-[#888]">
              <Spinner />
              {/* -preset slow is not quick on a long timeline; say so rather
                  than let a long pause read as a hang. */}
              Re-encoding and saving to the export folder…
            </span>
          )}

          {state === "done" && (
            <div className="flex flex-col gap-1">
              <p className="break-all text-sm text-[#ffffff]">{outcome || "Download started!"}</p>
              {note && <p className="break-all text-xs text-[#888]">{note}</p>}
            </div>
          )}

          {state === "error" && (
            <p className="text-sm text-red-400">{errorMsg}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex gap-3">
          {state === "exporting" ? (
            <button
              onClick={handleCancel}
              className="flex-1 py-2 rounded-xl border border-[#2a2a2e] text-sm text-[#888] hover:text-white transition-colors"
            >
              Cancel
            </button>
          ) : state === "saving" ? (
            // The render is done and the upload is in flight; stopping here
            // would throw the finished file away.
            <button
              disabled
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-[#2a2a2e] py-2 text-sm text-[#888] opacity-70"
            >
              <Spinner />
              Saving…
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                className="flex-1 py-2 rounded-xl border border-[#2a2a2e] text-sm text-[#888] hover:text-white transition-colors"
              >
                {state === "done" ? "Close" : "Cancel"}
              </button>
              <button
                onClick={handleExport}
                disabled={state === "done"}
                className="flex-1 py-2 rounded-xl bg-[#ffffff] text-black text-sm font-semibold hover:bg-[#e6e6e6] transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                <Download className="w-4 h-4" />
                {state === "done" ? "Exported" : "Export"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
