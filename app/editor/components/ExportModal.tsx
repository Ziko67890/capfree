"use client";

import { useState, useRef } from "react";
import { X, Download } from "lucide-react";
import { exportVideo, useTimelineEngine } from "@elah/editor";
import { saveExport } from "../api";
import { Spinner } from "./chrome";
import { useToast } from "./toast";

interface ExportModalProps {
  onClose: () => void;
}

type ExportState = "idle" | "exporting" | "saving" | "done" | "error";

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
  const [resolution, setResolution] = useState<"1080" | "720" | "480">("1080");
  const [outcome, setOutcome] = useState<string>("");
  const abortRef = useRef<AbortController | null>(null);
  const engine = useTimelineEngine();
  const toast = useToast();

  async function handleExport() {
    setState("exporting");
    setProgress(0);
    setErrorMsg("");
    setOutcome("");

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
        Hand the finished file to the API so it lands in a folder the user can
        find, and report the path it chose. If that fails the render must not
        go with it, so the browser downloads it instead and the toast says so
        -- re-encoding to recover from a missing API would be a poor trade.
      */
      setState("saving");
      try {
        const saved = await saveExport(file, {
          fps: project.fps,
          width: size.width,
          height: size.height,
          tracks: project.tracks.length,
          clips: Object.values(project.clips).reduce((total, list) => total + list.length, 0),
        });
        setOutcome(`Saved to ${saved.path}`);
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
          {/* Resolution picker */}
          <div>
            <label className="block text-xs text-[#888] mb-2">Resolution</label>
            <div className="flex gap-2">
              {(["1080", "720", "480"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setResolution(r)}
                  className={`flex-1 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    resolution === r
                      ? "bg-[#ffffff] text-black border-[#ffffff]"
                      : "bg-transparent text-[#888] border-[#2a2a2e] hover:border-[#444]"
                  }`}
                >
                  {r}p
                </button>
              ))}
            </div>
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
              Saving to the export folder…
            </span>
          )}

          {state === "done" && (
            <p className="break-all text-sm text-[#ffffff]">{outcome || "Download started!"}</p>
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
