"use client";

import { useState } from "react";
import { useTimelineEngine } from "@elah/editor";
import type { FillerHit } from "../../api";
import { requestFillerDetect, requestFillerRemove } from "../../api";
import { SPOKEN_LANGUAGES } from "../../library";
import { fileFromClip, replaceClipFile, targetVideoClip } from "../../timelineMedia";
import { seekFrame } from "../../captionActions";
import { stamp, useApiJob } from "../../useApiJob";
import { ErrorNote, HintNote, PanelBody, PrimaryButton, QuietButton, SearchField } from "../chrome";
import { useToast } from "../toast";

interface Detection {
  hits: FillerHit[];
  offsetFrames: number;
  duration: number;
}

function keyFor(hit: FillerHit, index: number): string {
  return `${index}:${hit.start}:${hit.word}`;
}

export function FillerFixPanel({ fps }: { fps: number }) {
  const engine = useTimelineEngine();
  const toast = useToast();
  const job = useApiJob();
  const [language, setLanguage] = useState("auto");
  const [extra, setExtra] = useState("");
  const [detection, setDetection] = useState<Detection | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  function detect() {
    job.run("detect", async () => {
      const located = targetVideoClip(engine);
      if (!located) throw new Error("Add a video to the timeline first.");
      const file = await fileFromClip(located.clip);
      const result = await requestFillerDetect(file, extra, language === "auto" ? undefined : language);
      const hits = result.fillers ?? [];
      if (hits.length === 0) {
        setDetection({ hits: [], offsetFrames: 0, duration: result.duration });
        setPicked(new Set());
        throw new Error("No filler words found in this clip.");
      }
      setDetection({
        hits,
        offsetFrames: located.clip.startFrame - (located.clip.sourceStartFrame ?? 0),
        duration: result.duration,
      });
      // Everything the backend flagged starts checked; untick to keep a word.
      setPicked(new Set(hits.map(keyFor)));
      toast(`${hits.length} filler word${hits.length === 1 ? "" : "s"} found`);
    });
  }

  function toggle(key: string) {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function removeSelected() {
    job.run("remove", async () => {
      if (!detection) throw new Error("Detect filler words first.");
      const segments = detection.hits
        .filter((hit, index) => picked.has(keyFor(hit, index)))
        .map((hit) => ({ start: hit.start, end: hit.end }));
      if (segments.length === 0) throw new Error("Tick at least one word to remove.");

      const located = targetVideoClip(engine);
      if (!located) throw new Error("Add a video to the timeline first.");
      const blob = await requestFillerRemove(await fileFromClip(located.clip), segments);
      const file = new File([blob], "cleaned.mp4", { type: "video/mp4" });
      await replaceClipFile(engine, located, file, "video", fps);
      setDetection(null);
      setPicked(new Set());
      toast(`${segments.length} segment${segments.length === 1 ? "" : "s"} cut`);
    });
  }

  const selectedCount = detection
    ? detection.hits.filter((hit, index) => picked.has(keyFor(hit, index))).length
    : 0;

  return (
    <PanelBody>
      {job.error && <ErrorNote text={job.error} />}
      <HintNote>Scans the selected clip, or the first video on the timeline, for um, uh, like…</HintNote>

      <label className="text-[11px] text-[#888899]">
        Spoken language
        <select
          value={language}
          onChange={(event) => setLanguage(event.target.value)}
          disabled={job.busy !== null}
          className="mb-2 mt-1 h-8 w-full rounded-md border border-[#2a2a30] bg-[#1a1a1e] px-2 text-[12px] text-white disabled:opacity-50"
        >
          <option value="auto">Detect automatically</option>
          {SPOKEN_LANGUAGES.map((item) => (
            <option key={item.code} value={item.code}>
              {item.label}
            </option>
          ))}
        </select>
      </label>

      <div className="mb-2">
        <SearchField value={extra} onChange={setExtra} placeholder="Extra words, comma separated" />
      </div>

      <PrimaryButton onClick={detect} busy={job.busy === "detect"} disabled={job.busy !== null}>
        {job.busy === "detect" ? "Scanning…" : "Detect filler words"}
      </PrimaryButton>

      {detection && detection.hits.length > 0 && (
        <>
          <p className="mb-1 mt-3 text-[11px] text-[#888899]">
            {selectedCount} of {detection.hits.length} selected
          </p>
          <ul className="flex flex-col gap-1">
            {detection.hits.map((hit, index) => {
              const key = keyFor(hit, index);
              return (
                <li
                  key={key}
                  className="flex items-center gap-2 rounded-md bg-[#1e1e24] px-2 py-1.5 text-[12px] text-white"
                >
                  <input
                    type="checkbox"
                    checked={picked.has(key)}
                    aria-label={hit.word}
                    onChange={() => toggle(key)}
                    className="accent-[#ffffff]"
                  />
                  <span className="flex-1 truncate">{hit.word}</span>
                  <button
                    type="button"
                    onClick={() => seekFrame(detection.offsetFrames + hit.start * fps)}
                    title="Jump to this word"
                    className="font-mono text-[10px] text-[#888899] transition-colors duration-150 hover:text-[#ffffff]"
                  >
                    {stamp(hit.start)}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex flex-col gap-1">
            <PrimaryButton
              onClick={removeSelected}
              busy={job.busy === "remove"}
              disabled={job.busy !== null || selectedCount === 0}
            >
              {job.busy === "remove" ? "Cutting…" : `Remove ${selectedCount} selected`}
            </PrimaryButton>
            <QuietButton
              onClick={() => setPicked(new Set(detection.hits.map(keyFor)))}
              disabled={job.busy !== null}
            >
              Select all
            </QuietButton>
            <QuietButton onClick={() => setPicked(new Set())} disabled={job.busy !== null}>
              Select none
            </QuietButton>
          </div>
        </>
      )}
    </PanelBody>
  );
}
