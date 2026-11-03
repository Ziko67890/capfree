"use client";

import { useState } from "react";
import { useTimelineEngine } from "@elah/editor";
import type { CaptionLine } from "../../api";
import { requestBurnSubtitles } from "../../api";
import { fetchCaptions, placeTimedCaption, seekFrame, srtFromCaptions } from "../../captionActions";
import { CAPTION_FONTS } from "../../catalog";
import { placeTextClip } from "../../clipEdit";
import { SPOKEN_LANGUAGES } from "../../library";
import { fileFromClip, swapClipMedia, targetVideoClip } from "../../timelineMedia";
import { stamp, useApiJob } from "../../useApiJob";
import { ErrorNote, PanelBody, PrimaryButton, QuietButton } from "../chrome";
import { useToast } from "../toast";

const STYLES = [
  {
    id: "boxed",
    label: "Boxed",
    className: "rounded bg-black/80 px-2 py-1 text-white",
    sample: "Hello there",
    text: { fontSize: 48, color: "#ffffff", fontFamily: "Inter", fontWeight: "bold" as const },
  },
  {
    id: "karaoke",
    label: "Karaoke",
    className: "text-[#00d4b4] underline decoration-2",
    sample: "SING WITH ME",
    text: { fontSize: 56, color: "#00d4b4", fontFamily: "Inter", fontWeight: "bold" as const },
  },
  {
    id: "minimal",
    label: "Minimal",
    className: "tracking-wide text-[#e8e8ee]",
    sample: "quiet words",
    text: { fontSize: 40, color: "#e8e8ee", fontFamily: "Inter", fontWeight: "normal" as const },
  },
  {
    id: "meme",
    label: "Meme",
    className: "font-[Anton] text-[18px] uppercase text-white capfree-stroke",
    sample: "WHEN YOU",
    text: { fontSize: 64, color: "#ffffff", fontFamily: "Anton", fontWeight: "bold" as const },
  },
  {
    id: "lower",
    label: "Lower third",
    className: "border-l-4 border-[#00d4b4] pl-2 text-left text-white",
    sample: "Jane Doe",
    text: { fontSize: 44, color: "#ffffff", fontFamily: "Inter", fontWeight: "bold" as const },
  },
] as const;

interface Transcript {
  lines: CaptionLine[];
  offsetFrames: number;
}

export function CaptionsPanel({ fps }: { fps: number }) {
  const engine = useTimelineEngine();
  const toast = useToast();
  const job = useApiJob();
  const [styleId, setStyleId] = useState<(typeof STYLES)[number]["id"]>("boxed");
  const [language, setLanguage] = useState("auto");
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [font, setFont] = useState<string>(CAPTION_FONTS[0]);
  const base = STYLES.find((item) => item.id === styleId) ?? STYLES[0];
  // The font picker overrides whatever the template carries.
  const style = { ...base, text: { ...base.text, fontFamily: font } };

  function runAutoCaptions() {
    job.run("captions", async () => {
      const { response, offsetFrames } = await fetchCaptions(engine, language);
      const lines = (response.captions ?? []).filter((line) => line.text.trim());
      if (lines.length === 0) throw new Error("No speech found in this clip.");
      setTranscript({ lines, offsetFrames });
      toast(`${lines.length} caption${lines.length === 1 ? "" : "s"} transcribed`);
    });
  }

  function addLine(line: CaptionLine) {
    if (!transcript) return;
    placeTimedCaption(engine, fps, line, transcript.offsetFrames, style.text);
    toast("Caption added");
  }

  function addAll() {
    if (!transcript) return;
    engine.batch(() => {
      for (const line of transcript.lines) {
        placeTimedCaption(engine, fps, line, transcript.offsetFrames, style.text);
      }
    }, "Auto captions");
    toast(`${transcript.lines.length} captions added to the timeline`);
  }

  function burnCaptions() {
    job.run("burn", async () => {
      if (!transcript) throw new Error("Run auto captions first.");
      const located = targetVideoClip(engine);
      if (!located) throw new Error("Add a video to the timeline first.");
      const srt = srtFromCaptions(transcript.lines);
      if (!srt.trim()) throw new Error("There are no captions to burn.");

      const blob = await requestBurnSubtitles(await fileFromClip(located.clip), srt, {
        fontSize: style.text.fontSize,
        position: "bottom",
        font,
      });
      const file = new File([blob], "captioned.mp4", { type: "video/mp4" });
      // Keep the clip's trim: restoring the full source length would overlap
      // whatever follows it.
      await swapClipMedia(engine, located, file, "video");
      toast("Captions burned into the clip");
    });
  }

  function addManual() {
    const clip = placeTextClip(engine, fps, style.sample, { y: 0.86, fontSize: style.text.fontSize, durationSec: 3 });
    engine.updateClip(clip.id, clip.trackId, { name: style.label, color: style.text.color });
    toast(`${style.label} caption added`);
  }

  return (
    <PanelBody>
      <div className="flex flex-col gap-3">
        {job.error && <ErrorNote text={job.error} />}

        <label className="text-[11px] text-[#888899]">
          Spoken language
          <select
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
            disabled={job.busy !== null}
            className="mt-1 h-8 w-full rounded-md border border-[#2a2a30] bg-[#1a1a1e] px-2 text-[12px] text-white disabled:opacity-50"
          >
            <option value="auto">Detect automatically</option>
            {SPOKEN_LANGUAGES.map((item) => (
              <option key={item.code} value={item.code}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <PrimaryButton onClick={runAutoCaptions} busy={job.busy === "captions"}>
          {job.busy === "captions" ? "Transcribing…" : "Auto captions"}
        </PrimaryButton>

        <label className="text-[11px] text-[#888899]">
          Font
          <select
            value={font}
            onChange={(event) => setFont(event.target.value)}
            className="mt-1 h-8 w-full rounded-md border border-[#2a2a30] bg-[#1a1a1e] px-2 text-[12px] text-white"
          >
            {CAPTION_FONTS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <p className="text-[11px] text-[#888899]">Templates</p>
        <div className="grid grid-cols-1 gap-1.5">
          {STYLES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setStyleId(item.id)}
              className={`rounded-md bg-[#0d0d0f] px-2 py-3 text-center ${styleId === item.id ? "ring-2 ring-[#00d4b4]" : ""}`}
            >
              <span className={item.className}>{item.sample}</span>
              <span className="mt-1 block text-[10px] text-[#888899]">{item.label}</span>
            </button>
          ))}
        </div>

        <QuietButton onClick={addManual}>Add blank caption</QuietButton>

        {transcript && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-[#888899]">Transcript · {transcript.lines.length} lines</p>
              <button
                type="button"
                onClick={() => setTranscript(null)}
                className="text-[11px] text-[#888899] transition-colors duration-150 hover:text-white"
              >
                Clear
              </button>
            </div>
            <QuietButton onClick={addAll}>Add all to timeline</QuietButton>
            <PrimaryButton
              onClick={burnCaptions}
              busy={job.busy === "burn"}
              disabled={job.busy !== null}
            >
              {job.busy === "burn" ? "Burning…" : "Burn captions"}
            </PrimaryButton>
            <ul className="flex flex-col gap-1">
              {transcript.lines.map((line, index) => (
                <li
                  key={`${line.start}-${index}`}
                  className="flex items-start gap-2 rounded-md bg-[#1e1e24] px-2 py-1.5 text-[11px] text-white"
                >
                  <button
                    type="button"
                    onClick={() => seekFrame(transcript.offsetFrames + line.start * fps)}
                    title="Jump to this line"
                    className="shrink-0 font-mono text-[10px] text-[#00d4b4] transition-colors duration-150 hover:text-white"
                  >
                    {stamp(line.start)}
                  </button>
                  <span className="flex-1 leading-snug">{line.text}</span>
                  <button
                    type="button"
                    onClick={() => addLine(line)}
                    title="Add this line to the timeline"
                    className="shrink-0 rounded bg-[#2a2a30] px-1.5 py-0.5 text-[10px] transition-colors duration-150 hover:bg-[#00d4b4] hover:text-black"
                  >
                    Add
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </PanelBody>
  );
}
