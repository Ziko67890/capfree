"use client";

import { useState } from "react";
import { useTimelineEngine } from "@elah/editor";
import { requestVocalIsolation, requestVocalMusic } from "../../api";
import { addAudioBlob } from "../../placeMedia";
import { fileFromClip, targetMediaClip } from "../../timelineMedia";
import { useApiJob } from "../../useApiJob";
import { ErrorNote, HintNote, PanelBody, PrimaryButton, QuietButton } from "../chrome";
import { useToast } from "../toast";

type StemId = "vocals" | "music";

interface Stem {
  blob: Blob;
  /** Made once per result: creating it in render would leak a URL per paint. */
  url: string;
  startFrame: number;
}

const STEMS: Array<{ id: StemId; label: string; action: string }> = [
  { id: "vocals", label: "Vocals", action: "Isolate vocals" },
  { id: "music", label: "Music", action: "Extract music" },
];

function sizeLabel(blob: Blob): string {
  const mb = blob.size / 1_048_576;
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(blob.size / 1024))} KB`;
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function VocalSplitPanel({ fps }: { fps: number }) {
  const engine = useTimelineEngine();
  const toast = useToast();
  const job = useApiJob();
  const [stems, setStems] = useState<Partial<Record<StemId, Stem>>>({});

  function split(id: StemId) {
    job.run(id, async () => {
      const located = targetMediaClip(engine);
      if (!located) throw new Error("Add a video or audio clip to the timeline first.");
      const file = await fileFromClip(located.clip);
      const blob = id === "vocals" ? await requestVocalIsolation(file) : await requestVocalMusic(file);
      setStems((current) => {
        const previous = current[id];
        if (previous) URL.revokeObjectURL(previous.url);
        return {
          ...current,
          [id]: { blob, url: URL.createObjectURL(blob), startFrame: located.clip.startFrame },
        };
      });
      toast(`${id === "vocals" ? "Vocals" : "Music"} ready`);
    });
  }

  function addToTimeline(id: StemId, stem: Stem) {
    const label = id === "vocals" ? "Vocals" : "Music";
    job.run(`add-${id}`, async () => {
      const clipId = await addAudioBlob(engine, stem.blob, label, stem.startFrame);
      if (!clipId) throw new Error(`Could not place the ${label.toLowerCase()} track.`);
      toast(`${label} added to the timeline`);
    });
  }

  return (
    <PanelBody>
      {job.error && <ErrorNote text={job.error} />}
      <HintNote>
        Splits the selected clip, or the first video on the timeline, with Demucs. Large files take a while.
      </HintNote>
      <div className="flex flex-col gap-2">
        {STEMS.map((stem) => {
          const result = stems[stem.id];
          return (
            <div key={stem.id} className="rounded-md bg-[#1e1e24] p-2">
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-[11px] text-[#c8c8ce]">{stem.label}</p>
                {result && <span className="text-[10px] text-[#888899]">{sizeLabel(result.blob)}</span>}
              </div>
              <PrimaryButton
                onClick={() => split(stem.id)}
                busy={job.busy === stem.id}
                disabled={job.busy !== null && job.busy !== stem.id}
              >
                {job.busy === stem.id ? "Splitting…" : result ? `Re-run ${stem.label.toLowerCase()}` : stem.action}
              </PrimaryButton>
              {result && (
                <div className="mt-1.5 flex flex-col gap-1">
                  <QuietButton
                    onClick={() => addToTimeline(stem.id, result)}
                    disabled={job.busy !== null}
                  >
                    Add to timeline
                  </QuietButton>
                  <QuietButton onClick={() => download(result.blob, `${stem.id}.mp3`)}>Download</QuietButton>
                  <audio controls src={result.url} className="mt-1 h-8 w-full" />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[10px] text-[#888899]">Timeline runs at {fps} fps.</p>
    </PanelBody>
  );
}
