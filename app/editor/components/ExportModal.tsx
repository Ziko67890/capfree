"use client";

import { useState, useRef } from "react";
import { X, Download } from "lucide-react";
import { exportVideo, useTimelineEngine } from "@elah/editor";

interface ExportModalProps {
  onClose: () => void;
}

type ExportState = "idle" | "exporting" | "done" | "error";

export function ExportModal({ onClose }: ExportModalProps) {
  const [state, setState] = useState<ExportState>("idle");
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [resolution, setResolution] = useState<"1080" | "720" | "480">("1080");
  const abortRef = useRef<AbortController | null>(null);
  const engine = useTimelineEngine();

  async function handleExport() {
    setState("exporting");
    setProgress(0);
    setErrorMsg("");

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const outputHeight = resolution === "1080" ? 1080 : resolution === "720" ? 720 : 480;

    try {
      const project = engine.getProject();
      // clips is a Record<trackId, Clip[]>; check if any track has clips
      const hasClips = Object.values(project.clips).some((c) => c.length > 0);

      if (!hasClips) {
        setErrorMsg("Nothing on the timeline yet. Add some clips first.");
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

      // Trigger download
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `capfree-export-${Date.now()}.mp4`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);

      setState("done");
    } catch (err: unknown) {
      if ((err as { name?: string }).name === "AbortError") {
        setState("idle");
      } else {
        console.error(err);
        setErrorMsg(err instanceof Error ? err.message : "Export failed");
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
                      ? "bg-[#00d4b4] text-black border-[#00d4b4]"
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
                  className="h-full bg-[#00d4b4] rounded-full transition-all duration-150"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {state === "done" && (
            <p className="text-sm text-[#00d4b4]">Download started!</p>
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
                className="flex-1 py-2 rounded-xl bg-[#00d4b4] text-black text-sm font-semibold hover:bg-[#00bba3] transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
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
