"use client";

import { useState } from "react";
import { useTimelineEngine, type Clip, type TimelineEngine } from "@elah/editor";
import { requestTranslate } from "../../api";
import { placeTimedCaption } from "../../captionActions";
import { SPOKEN_LANGUAGES, TRANSLATE_LANGUAGES } from "../../library";
import { useApiJob } from "../../useApiJob";
import { ErrorNote, HintNote, PanelBody, PrimaryButton, QuietButton } from "../chrome";
import { useToast } from "../toast";

const CAPTION_STYLE = {
  fontSize: 48,
  color: "#ffffff",
  fontFamily: "Inter",
  fontWeight: "bold" as const,
};

interface TextClip {
  clip: Clip;
  trackId: string;
  text: string;
}

/** Every text clip on the timeline, in playback order. */
function textClips(engine: TimelineEngine): TextClip[] {
  const project = engine.getProject();
  const found: TextClip[] = [];
  for (const track of project.tracks) {
    for (const clip of project.clips[track.id] ?? []) {
      if (clip.type !== "text") continue;
      const text = String(clip.content ?? "").trim();
      if (text) found.push({ clip, trackId: track.id, text });
    }
  }
  return found.sort((a, b) => a.clip.startFrame - b.clip.startFrame);
}

export function TranslatePanel({ fps }: { fps: number }) {
  const engine = useTimelineEngine();
  const toast = useToast();
  const job = useApiJob();
  const [source, setSource] = useState("auto");
  const [target, setTarget] = useState("es");
  const [draft, setDraft] = useState("");
  const [lines, setLines] = useState<string[] | null>(null);

  const sourceLines = draft.split("\n").map((line) => line.trim()).filter(Boolean);
  const targetLabel = TRANSLATE_LANGUAGES.find((item) => item.code === target)?.label ?? target;

  function pullFromTimeline() {
    const found = textClips(engine);
    if (found.length === 0) {
      toast("No text or caption clips on the timeline.", "error");
      return;
    }
    setDraft(found.map((item) => item.text).join("\n"));
    setLines(null);
    toast(`${found.length} line${found.length === 1 ? "" : "s"} pulled in`);
  }

  function translate() {
    job.run("translate", async () => {
      if (sourceLines.length === 0) throw new Error("Add some text to translate first.");
      const result = await requestTranslate(sourceLines.join("\n"), target, source);
      const out = result.lines?.length ? result.lines : result.text.split("\n");
      setLines(out);
      toast(`Translated to ${targetLabel}`);
    });
  }

  /** Replaces each text clip's content in place, pairing by position. */
  function applyToClips() {
    if (!lines) return;
    const found = textClips(engine);
    if (found.length === 0) {
      toast("No text clips to update.", "error");
      return;
    }
    const pairs = Math.min(found.length, lines.length);
    engine.batch(() => {
      for (let index = 0; index < pairs; index += 1) {
        engine.updateClip(found[index].clip.id, found[index].trackId, {
          content: lines[index],
          name: lines[index].slice(0, 40),
        });
      }
    }, "Translate text clips");
    toast(`${pairs} clip${pairs === 1 ? "" : "s"} translated`);
  }

  /** Lays the translation onto its own caption track, two seconds a line. */
  function addAsCaptions() {
    if (!lines) return;
    engine.batch(() => {
      lines.forEach((text, index) => {
        placeTimedCaption(
          engine,
          fps,
          { start: index * 2, end: index * 2 + 2, text },
          0,
          CAPTION_STYLE,
          { trackName: "Captions 2", y: 0.74 },
        );
      });
    }, "Translated captions");
    toast(`${lines.length} captions added`);
  }

  return (
    <PanelBody>
      {job.error && <ErrorNote text={job.error} />}
      <HintNote>One line per subtitle. Pull the timeline&apos;s text clips in, or type your own.</HintNote>

      <div className="grid grid-cols-2 gap-1.5">
        <label className="text-[11px] text-[#888899]">
          From
          <select
            value={source}
            onChange={(event) => setSource(event.target.value)}
            disabled={job.busy !== null}
            className="mt-1 h-8 w-full rounded-md border border-[#2a2a30] bg-[#1a1a1e] px-2 text-[12px] text-white disabled:opacity-50"
          >
            <option value="auto">Detect</option>
            {SPOKEN_LANGUAGES.map((item) => (
              <option key={item.code} value={item.code}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] text-[#888899]">
          To
          <select
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            disabled={job.busy !== null}
            className="mt-1 h-8 w-full rounded-md border border-[#2a2a30] bg-[#1a1a1e] px-2 text-[12px] text-white disabled:opacity-50"
          >
            {TRANSLATE_LANGUAGES.map((item) => (
              <option key={item.code} value={item.code}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-2">
        <QuietButton onClick={pullFromTimeline} disabled={job.busy !== null}>
          Pull text from timeline
        </QuietButton>
      </div>

      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="One line per subtitle"
        rows={5}
        className="capfree-scroll mt-2 w-full resize-y rounded-md border border-[#2a2a30] bg-[#1a1a1e] p-2 text-[12px] leading-snug text-white outline-none transition-colors duration-150 placeholder:text-[#888899] focus:border-[#00d4b4]"
      />

      <div className="mt-2">
        <PrimaryButton
          onClick={translate}
          busy={job.busy === "translate"}
          disabled={job.busy !== null || sourceLines.length === 0}
        >
          {job.busy === "translate" ? "Translating…" : `Translate to ${targetLabel}`}
        </PrimaryButton>
      </div>

      {lines && (
        <>
          <p className="mb-1 mt-3 text-[11px] text-[#888899]">{targetLabel} · {lines.length} lines</p>
          <ul className="flex flex-col gap-2">
            {lines.map((line, index) => (
              <li key={`${index}-${line}`} className="grid grid-cols-1 gap-1">
                <p className="rounded-md bg-[#1e1e24] p-1.5 text-[11px] leading-snug text-[#c8c8ce]">
                  {sourceLines[index] ?? ""}
                </p>
                <p className="rounded-md bg-[#111114] p-1.5 text-[11px] leading-snug text-white">{line}</p>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-col gap-1">
            <QuietButton onClick={applyToClips} disabled={job.busy !== null}>
              Replace text on timeline
            </QuietButton>
            <QuietButton onClick={addAsCaptions} disabled={job.busy !== null}>
              Add as new caption track
            </QuietButton>
          </div>
        </>
      )}
    </PanelBody>
  );
}
