"use client";

import { useRef } from "react";
import { createEffect } from "@elah/core";
import {
  applyTextTemplate,
  BUILT_IN_TEXT_TEMPLATES,
  useTimelineEngine,
  type Clip,
  type MotionSpec,
  type TextAnimation,
  type TextAnimationKind,
} from "@elah/editor";
import { placeTimedCaption } from "../../captionActions";
import { CAPTION_FONTS } from "../../catalog";
import { deleteSelection, placeTextClip, selectedClips } from "../../clipEdit";
import { useSelectedClip } from "../../useSelectedClip";
import { FONT_LIST, TEXT_PRESETS } from "../../visuals";
import { TEXT_EFFECTS, TEXT_MOTIONS, TEXT_STYLES } from "../../library";
import { HintNote, PanelBody, PrimaryButton, QuietButton } from "../chrome";
import { useToast } from "../toast";

const TEXT_COLORS = [
  "#ffffff",
  "#000000",
  "#ffffff",
  "#ffd166",
  "#ef476f",
  "#118ab2",
  "#06d6a0",
  "#8338ec",
];

const ANIMATIONS = [
  { id: "none", label: "None" },
  { id: "fade", label: "Fade" },
  { id: "slide", label: "Slide" },
  { id: "pop", label: "Pop" },
] as const;

type AnimationId = (typeof ANIMATIONS)[number]["id"];
type Slot = "in" | "out";

const ALIGNMENTS = ["left", "center", "right"] as const;
const SLOTS: readonly Slot[] = ["in", "out"];
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** Which of the four choices the clip's current animation corresponds to. */
function animationOf(animation: TextAnimation | undefined, slot: Slot): AnimationId {
  const kind = slot === "in" ? animation?.in : animation?.out;
  const motion = slot === "in" ? animation?.inMotion : animation?.outMotion;
  if (!kind) return "none";
  // Pop is a fade carrying a scale, so the scale is what distinguishes it.
  if (motion?.scale !== undefined) return "pop";
  if (kind.startsWith("slide")) return "slide";
  return "fade";
}

/** Rewrites one side of the animation, leaving the other side alone. */
function withAnimation(
  current: TextAnimation | undefined,
  slot: Slot,
  id: AnimationId,
  fps: number,
): TextAnimation | undefined {
  const durationFrames = current?.durationFrames ?? Math.max(1, Math.round(fps * 0.4));

  let kind: TextAnimationKind | undefined;
  let motion: MotionSpec | undefined;
  if (id === "fade") {
    kind = "fade";
  } else if (id === "slide") {
    kind = slot === "in" ? "slide-up" : "slide-down";
  } else if (id === "pop") {
    // The SDK has no "pop" kind, so a fade carries the scale that pops it.
    kind = "fade";
    motion = { scale: 0.55, opacity: 0, ease: slot === "in" ? "back-out" : "back-in" };
  }

  const next: TextAnimation =
    slot === "in"
      ? { out: current?.out, outMotion: current?.outMotion, in: kind, inMotion: motion, durationFrames }
      : { in: current?.in, inMotion: current?.inMotion, out: kind, outMotion: motion, durationFrames };

  return next.in || next.out ? next : undefined;
}

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
  // Reactive, so the controls below mirror whatever is selected right now.
  const selected = useSelectedClip();
  const textClip = selected?.clip.type === "text" ? selected : null;

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
    else if (name === "Glow") engine.updateClip(clip.id, clip.trackId, { textShadow: { color: "#ffffff", blur: 18, offsetX: 0, offsetY: 0 } });
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

  /** Writes straight onto the selected clip, so every control is live. */
  function patch(updates: Partial<Clip>) {
    if (!textClip) return;
    engine.updateClip(textClip.clip.id, textClip.trackId, updates);
  }

  function setAnimation(slot: Slot, id: AnimationId) {
    if (!textClip) return;
    patch({ textAnimation: withAnimation(textClip.clip.textAnimation, slot, id, fps) });
  }

  function removeText() {
    const error = deleteSelection(engine);
    if (error) toast(error, "error");
    else toast("Text clip deleted");
  }

  const chipClass = (on: boolean) =>
    `h-7 flex-1 rounded-md border text-[11px] text-white transition-colors duration-150 ${
      on ? "border-[#ffffff] bg-[#1e1e24]" : "border-[#3a3a40] bg-[#1a1a1e] hover:border-[#ffffff]"
    }`;

  return (
    <PanelBody>
      <div className="flex flex-col gap-3">
        <PrimaryButton onClick={() => placeTextClip(engine, fps, "Text")}>Add text</PrimaryButton>

        <section>
          <h3 className="mb-1 text-[11px] text-[#888899]">Selected text</h3>
          {!textClip ? (
            <HintNote>Select a text clip on the timeline to style it.</HintNote>
          ) : (
            <div className="flex flex-col gap-2 rounded-md bg-[#1a1a1e] p-2">
              <label className="text-[11px] text-[#c8c8ce]">
                Font
                <select
                  value={textClip.clip.fontFamily ?? CAPTION_FONTS[0]}
                  aria-label="Text font"
                  onChange={(event) => patch({ fontFamily: event.target.value })}
                  className="mt-1 h-8 w-full rounded-md border border-[#3a3a40] bg-[#1a1a1e] px-2 text-[12px] text-white"
                >
                  {CAPTION_FONTS.map((font) => (
                    <option key={font} value={font}>
                      {font}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-[11px] text-[#c8c8ce]">
                <span className="flex items-center justify-between">
                  Size
                  <span className="font-mono text-[#9a9aa2]">{textClip.clip.fontSize ?? 64}</span>
                </span>
                <input
                  type="range"
                  min={12}
                  max={160}
                  step={1}
                  value={textClip.clip.fontSize ?? 64}
                  aria-label="Text size"
                  onChange={(event) =>
                    engine.previewClip(textClip.clip.id, textClip.trackId, {
                      fontSize: Number(event.target.value),
                    })
                  }
                  onPointerUp={(event) => {
                    patch({ fontSize: Number(event.currentTarget.value) });
                    engine.commitInteraction("Text size");
                  }}
                  className="w-full accent-[#ffffff]"
                />
              </label>

              <div className="flex flex-col gap-1">
                <span className="text-[11px] text-[#c8c8ce]">Colour</span>
                <div className="grid grid-cols-8 gap-1">
                  {TEXT_COLORS.map((colour) => {
                    const on = (textClip.clip.color ?? "#ffffff").toLowerCase() === colour;
                    return (
                      <button
                        key={colour}
                        type="button"
                        aria-label={`Colour ${colour}`}
                        aria-pressed={on}
                        onClick={() => patch({ color: colour })}
                        style={{ background: colour }}
                        className={`h-6 w-full rounded border ${on ? "border-[#ffffff]" : "border-[#3a3a40]"}`}
                      />
                    );
                  })}
                </div>
                <input
                  type="text"
                  value={textClip.clip.color ?? "#ffffff"}
                  aria-label="Text colour hex"
                  spellCheck={false}
                  onChange={(event) => {
                    const raw = event.target.value.trim();
                    // Only a complete hex commits; partial typing must not write.
                    if (HEX_RE.test(raw)) patch({ color: raw });
                  }}
                  className="h-7 w-full rounded-md border border-[#3a3a40] bg-[#1a1a1e] px-2 font-mono text-[11px] text-white"
                />
              </div>

              <div className="flex gap-1">
                <button
                  type="button"
                  aria-label="Bold"
                  aria-pressed={textClip.clip.fontWeight === "bold"}
                  onClick={() =>
                    patch({ fontWeight: textClip.clip.fontWeight === "bold" ? "normal" : "bold" })
                  }
                  className={`${chipClass(textClip.clip.fontWeight === "bold")} font-bold`}
                >
                  B
                </button>
                <button
                  type="button"
                  aria-label="Italic"
                  aria-pressed={textClip.clip.fontStyle === "italic"}
                  onClick={() =>
                    patch({ fontStyle: textClip.clip.fontStyle === "italic" ? "normal" : "italic" })
                  }
                  className={`${chipClass(textClip.clip.fontStyle === "italic")} italic`}
                >
                  I
                </button>
                <button
                  type="button"
                  aria-label="Underline"
                  aria-pressed={textClip.clip.textDecoration === "underline"}
                  onClick={() =>
                    patch({
                      textDecoration:
                        textClip.clip.textDecoration === "underline" ? undefined : "underline",
                    })
                  }
                  className={`${chipClass(textClip.clip.textDecoration === "underline")} underline`}
                >
                  U
                </button>
              </div>

              <div className="flex gap-1">
                {ALIGNMENTS.map((align) => (
                  <button
                    key={align}
                    type="button"
                    aria-pressed={(textClip.clip.textAlign ?? "center") === align}
                    onClick={() => patch({ textAlign: align })}
                    className={`${chipClass((textClip.clip.textAlign ?? "center") === align)} capitalize`}
                  >
                    {align}
                  </button>
                ))}
              </div>

              {SLOTS.map((slot) => (
                <div key={slot} className="flex flex-col gap-1">
                  <span className="text-[11px] capitalize text-[#c8c8ce]">Animation {slot}</span>
                  <div className="flex gap-1">
                    {ANIMATIONS.map((animation) => {
                      const on = animationOf(textClip.clip.textAnimation, slot) === animation.id;
                      return (
                        <button
                          key={animation.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() => setAnimation(slot, animation.id)}
                          className={chipClass(on)}
                        >
                          {animation.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              <QuietButton onClick={removeText} tone="danger">
                Delete text clip
              </QuietButton>
            </div>
          )}
        </section>
        <section>
          <h3 className="mb-1 text-[11px] text-[#888899]">Text presets</h3>
          <div className="grid grid-cols-2 gap-1.5">
            {TEXT_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset)}
                className="flex h-[80px] items-center justify-center overflow-hidden rounded-md bg-[#0d0d0f] px-1 transition duration-150 hover:ring-1 hover:ring-[#ffffff]"
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
