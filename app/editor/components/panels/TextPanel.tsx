"use client";

import { useRef } from "react";
import { createEffect } from "@elah/core";
import { applyTextTemplate, BUILT_IN_TEXT_TEMPLATES, useTimelineEngine, type Clip } from "@elah/editor";
import { placeTimedCaption } from "../../captionActions";
import { placeTextClip, selectedClips } from "../../clipEdit";
import { FONT_LIST, TEXT_PRESETS } from "../../visuals";
import { TEXT_EFFECTS, TEXT_MOTIONS, TEXT_STYLES } from "../../library";
import { PanelBody, PrimaryButton, QuietButton } from "../chrome";
import { useToast } from "../toast";

interface TextPanelProps {
  fps: number;
}

function parseTimestamp(raw: string): number {
  const cleaned = raw.trim().replace(",", ".");
  const parts = cleaned.split(":");
  if (parts.length === 3) return Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
  if (parts.length === 2) return Number(parts[0]) * 60 + Number(parts[1]);
  return Number(cleaned) || 0;
}

function parseSubs(text: string): Array<{ start: number; end: number; text: string }> {
  const blocks = text.replace(/^\uFEFF/, "").replace(/\r/g, "").split(/\n{2,}/);
  const lines: Array<{ start: number; end: number; text: string }> = [];
  for (const block of blocks) {
    const rows = block.split("\n").map((row) => row.trim()).filter(Boolean);
    if (rows[0] === "WEBVTT" || rows[0]?.startsWith("NOTE") || rows[0]?.startsWith("STYLE")) continue;
    const timeIndex = rows.findIndex((row) => row.includes("-->"));
    if (timeIndex < 0) continue;
    const [startRaw, endRaw] = rows[timeIndex].split("-->");
    const caption = rows.slice(timeIndex + 1).join(" ").replace(/<[^>]+>/g, "").trim();
    if (!caption) continue;
    lines.push({ start: parseTimestamp(startRaw), end: parseTimestamp(endRaw.split(" ")[0] ?? ""), text: caption });
  }
  return lines;
}

export function TextPanel({ fps }: TextPanelProps) {
  const engine = useTimelineEngine();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const style = TEXT_STYLES[0];

  function currentText(): Clip | null {
    return selectedClips(engine).find((hit) => hit.clip.type === "text")?.clip ?? null;
  }

  function applyPreset(preset: (typeof TEXT_PRESETS)[number]) {
    const clip = currentText() ?? placeTextClip(engine, fps, preset.sample, { fontSize: preset.fontSize });
    engine.updateClip(clip.id, clip.trackId, {
      content: preset.sample,
      name: preset.label,
      fontFamily: preset.fontFamily,
      fontWeight: preset.fontWeight,
      color: preset.color,
      fontSize: preset.fontSize,
      textAlign: preset.id === "lower" ? "left" : "center",
      ...(preset.outline ? { textOutline: preset.outline } : {}),
      ...(preset.shadow ? { textShadow: preset.shadow } : {}),
    });
    toast(`${preset.label} applied`);
  }

  function applyFont(fontFamily: string) {
    const clip = currentText() ?? placeTextClip(engine, fps, "Text");
    engine.updateClip(clip.id, clip.trackId, { fontFamily });
    toast(`${fontFamily} applied`);
  }

  function effectClip(name: (typeof TEXT_EFFECTS)[number]) {
    const clip = currentText() ?? placeTextClip(engine, fps, "Text");
    if (name === "Outline") engine.updateClip(clip.id, clip.trackId, { textOutline: { color: "#000000", width: 6 } });
    else if (name === "Shadow") engine.updateClip(clip.id, clip.trackId, { textShadow: { color: "#000000", blur: 0, offsetX: 4, offsetY: 4 } });
    else if (name === "Glow") engine.updateClip(clip.id, clip.trackId, { textShadow: { color: "#00d4b4", blur: 18, offsetX: 0, offsetY: 0 } });
    else if (name === "3D") engine.updateClip(clip.id, clip.trackId, { textShadow: { color: "#222228", blur: 0, offsetX: 6, offsetY: 6 }, fontWeight: "bold" });
    else if (name === "Gradient") engine.updateClip(clip.id, clip.trackId, { color: "#7cf6e4", textOutline: { color: "#0b3d36", width: 2 } });
    else {
      const blur = createEffect("gaussianBlur");
      blur.params = { ...blur.params, radius: 6 };
      engine.updateClip(clip.id, clip.trackId, { effects: [...(clip.effects ?? []), blur] });
    }
    toast(`${name} applied`);
  }

  function motionClip(item: (typeof TEXT_MOTIONS)[number]) {
    const template = BUILT_IN_TEXT_TEMPLATES.find((entry) => entry.id === item.templateId);
    const clip = currentText() ?? placeTextClip(engine, fps, item.label);
    if (!template) {
      toast("That animation is not available.", "error");
      return;
    }
    engine.updateClip(clip.id, clip.trackId, { ...applyTextTemplate(template, clip), name: item.label });
    toast(`${item.label} applied`);
  }

  function importSubs(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const lines = parseSubs(String(reader.result ?? ""));
      if (lines.length === 0) {
        toast("No captions found in that file.", "error");
        return;
      }
      for (const line of lines) placeTimedCaption(engine, fps, line, 0, style);
      toast(`Added ${lines.length} captions`);
    };
    reader.onerror = () => toast("Could not read that subtitle file.", "error");
    reader.readAsText(file);
  }

  return (
    <PanelBody>
      <div className="flex flex-col gap-3">
        <PrimaryButton onClick={() => placeTextClip(engine, fps, "Text")}>Add text</PrimaryButton>
        <section>
          <h3 className="mb-1 text-[11px] text-[#888899]">Text presets</h3>
          <div className="grid grid-cols-2 gap-1.5">
            {TEXT_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset)}
                className="flex h-[80px] items-center justify-center overflow-hidden rounded-md bg-[#0d0d0f] px-1 transition duration-150 hover:ring-1 hover:ring-[#00d4b4]"
              >
                <span className={preset.cardClass}>
                  {preset.sample}
                  {preset.id === "lower" ? <span className="mt-0.5 block text-[9px] font-normal text-[#888899]">Creator</span> : null}
                </span>
              </button>
            ))}
          </div>
        </section>
        <section>
          <h3 className="mb-1 text-[11px] text-[#888899]">Fonts</h3>
          <ul className="flex flex-col gap-1">
            {FONT_LIST.map((font) => (
              <li key={font}>
                <button
                  type="button"
                  onClick={() => applyFont(font)}
                  className="flex w-full flex-col rounded-md bg-[#2a2a30] px-2 py-1.5 text-left transition-colors duration-150 hover:bg-[#3a3a42]"
                >
                  <span className="text-[12px] text-white" style={{ fontFamily: `${font}, sans-serif` }}>
                    {font}
                  </span>
                  <span className="text-[10px] text-[#888899]" style={{ fontFamily: `${font}, sans-serif` }}>
                    The quick brown fox
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h3 className="mb-1 text-[11px] text-[#888899]">Text effects</h3>
          <div className="grid grid-cols-3 gap-1.5">
            {TEXT_EFFECTS.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => effectClip(name)}
                className="rounded-md bg-[#2a2a30] px-1 py-2 text-[11px] text-white transition-colors duration-150 hover:bg-[#3a3a42]"
              >
                {name}
              </button>
            ))}
          </div>
        </section>
        <section>
          <h3 className="mb-1 text-[11px] text-[#888899]">Motion</h3>
          <div className="grid grid-cols-2 gap-1.5">
            {TEXT_MOTIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => motionClip(item)}
                className="rounded-md bg-[#2a2a30] px-2 py-3 text-left text-[12px] text-white transition-colors duration-150 hover:bg-[#3a3a42]"
              >
                {item.label}
              </button>
            ))}
          </div>
        </section>
        <input
          ref={fileRef}
          type="file"
          accept=".srt,.vtt,text/vtt,application/x-subrip"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) importSubs(file);
          }}
        />
        <QuietButton onClick={() => fileRef.current?.click()}>Upload .srt or .vtt</QuietButton>
      </div>
    </PanelBody>
  );
}
