"use client";

import { useEffect, useRef, useState } from "react";
import { playbackStore, useTimelineEngine } from "@elah/editor";
import { ensureTrack, selectClip } from "../../clipEdit";
import { usePreviewLook } from "../../previewLook";
import { useSelectedClip } from "../../useSelectedClip";
import { SAMPLE_PHOTO_WIDE } from "../../visuals";
import { PanelBody, PrimaryButton, QuietButton } from "../chrome";
import { useToast } from "../toast";

const KEYS = [
  "exposure",
  "brightness",
  "contrast",
  "saturation",
  "sharpness",
  "highlights",
  "shadows",
  "temperature",
  "tint",
  "vignette",
  "grain",
  "fade",
] as const;

type Key = (typeof KEYS)[number];
type Values = Record<Key, number>;

const ZERO: Values = {
  exposure: 0,
  brightness: 0,
  contrast: 0,
  saturation: 0,
  sharpness: 0,
  highlights: 0,
  shadows: 0,
  temperature: 0,
  tint: 0,
  vignette: 0,
  grain: 0,
  fade: 0,
};

const LABELS: Record<Key, string> = {
  exposure: "Exposure",
  brightness: "Brightness",
  contrast: "Contrast",
  saturation: "Saturation",
  sharpness: "Sharpness",
  highlights: "Highlights",
  shadows: "Shadows",
  temperature: "Warmth",
  tint: "Tint",
  vignette: "Vignette",
  grain: "Grain",
  fade: "Fade",
};

function cssFor(values: Values): { css: string; vignette: number; grain: number } {
  const parts: string[] = [];
  const brightness = 1 + (values.exposure + values.brightness) / 200 + values.highlights / 400 + values.shadows / 500;
  if (Math.abs(brightness - 1) > 0.001) parts.push(`brightness(${brightness.toFixed(3)})`);
  const contrast = 1 + values.contrast / 100 + Math.max(0, values.sharpness) / 250;
  if (Math.abs(contrast - 1) > 0.001) parts.push(`contrast(${contrast.toFixed(3)})`);
  const saturate = 1 + values.saturation / 100;
  if (Math.abs(saturate - 1) > 0.001) parts.push(`saturate(${saturate.toFixed(3)})`);
  if (values.temperature > 0) parts.push(`sepia(${(values.temperature / 280).toFixed(3)})`);
  const hue = values.tint * 0.7 + (values.temperature < 0 ? values.temperature * 0.45 : 0);
  if (Math.abs(hue) > 0.4) parts.push(`hue-rotate(${hue.toFixed(1)}deg)`);
  if (values.sharpness < 0) parts.push(`blur(${((-values.sharpness / 100) * 3).toFixed(2)}px)`);
  if (values.fade !== 0) parts.push(`opacity(${(1 - Math.min(100, Math.abs(values.fade)) / 140).toFixed(3)})`);
  return {
    css: parts.join(" "),
    vignette: Math.max(0, values.vignette),
    grain: Math.max(0, values.grain),
  };
}

interface AdjustmentPanelProps {
  fps: number;
}

export function AdjustmentPanel({ fps }: AdjustmentPanelProps) {
  const engine = useTimelineEngine();
  const toast = useToast();
  const look = usePreviewLook();
  const selected = useSelectedClip();
  const fileRef = useRef<HTMLInputElement>(null);
  const memory = useRef<Record<string, Values>>({});
  const [values, setValues] = useState<Values>(ZERO);
  const [split, setSplit] = useState(false);

  useEffect(() => {
    const stored = selected ? (memory.current[selected.clip.id] ?? ZERO) : values;
    if (selected) setValues(stored);
    const next = cssFor(selected ? stored : values);
    look.setAdjust(next.css, next.vignette, next.grain);
    // Re-read only when the clip changes so slider drags stay live.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.clip.id]);

  function write(next: Values) {
    setValues(next);
    if (selected) memory.current[selected.clip.id] = next;
    const css = cssFor(next);
    look.setAdjust(css.css, css.vignette, css.grain);
  }

  function addAdjustment(name: string) {
    try {
      const trackId = ensureTrack(engine, "video", "Video 1");
      const clip = engine.addClip({
        type: "adjustment",
        trackId,
        name,
        startFrame: playbackStore.getState().currentFrame,
        durationFrames: fps * 5,
      });
      selectClip(clip.id);
      toast(`${name} added`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not add an adjustment.", "error");
    }
  }

  const live = cssFor(values);

  return (
    <PanelBody>
      <div className="flex flex-col gap-2">
        <div className="overflow-hidden rounded-md bg-black">
          {split ? (
            <div className="grid grid-cols-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={SAMPLE_PHOTO_WIDE} alt="Before" className="h-24 w-full object-cover" />
              <span className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={SAMPLE_PHOTO_WIDE} alt="After" className="h-24 w-full object-cover" style={{ filter: live.css || undefined }} />
                {live.vignette > 0 && <span className="capfree-vignette pointer-events-none absolute inset-0" />}
                {live.grain > 0 && (
                  <span
                    className="capfree-grain pointer-events-none absolute inset-0"
                    style={{ opacity: (live.grain / 100) * 0.5 }}
                  />
                )}
              </span>
            </div>
          ) : (
            <span className="relative block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={SAMPLE_PHOTO_WIDE} alt="Adjustment preview" className="h-28 w-full object-cover" style={{ filter: live.css || undefined }} />
              {live.vignette > 0 && <span className="capfree-vignette pointer-events-none absolute inset-0" />}
              {live.grain > 0 && (
                <span
                  className="capfree-grain pointer-events-none absolute inset-0"
                  style={{ opacity: (live.grain / 100) * 0.5 }}
                />
              )}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setSplit((current) => !current)}
          className={`h-8 rounded-md text-[12px] transition-colors duration-150 ${split ? "bg-[#ffffff] text-black" : "bg-[#2a2a30] text-white"}`}
        >
          Before ↔ After
        </button>
        <PrimaryButton onClick={() => addAdjustment("Adjustment")}>Add adjustment</PrimaryButton>
        <button
          type="button"
          onClick={() => addAdjustment("Custom adjustment")}
          className="rounded-md bg-[#2a2a30] px-3 py-3 text-left text-[12px] text-white transition-colors duration-150 hover:bg-[#3a3a42]"
        >
          Custom adjustment
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".cube"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            if (!file.name.toLowerCase().endsWith(".cube")) {
              toast("Choose a .cube LUT file.", "error");
              return;
            }
            toast(`LUT loaded: ${file.name}`);
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="rounded-md bg-[#2a2a30] px-3 py-3 text-left text-[12px] text-white transition-colors duration-150 hover:bg-[#3a3a42]"
        >
          LUT
          <span className="mt-0.5 block text-[10px] text-[#888899]">Upload a .cube file</span>
        </button>
        <div className="mt-2 flex flex-col gap-3">
          {KEYS.map((key) => (
            <label key={key} className="flex flex-col gap-1 text-[11px] text-[#c8c8ce]">
              <span className="flex items-center justify-between">
                {LABELS[key]}
                <span className="flex items-center gap-2">
                  <span className="font-mono text-[#888899]">{values[key]}</span>
                  <button type="button" className="text-[10px] text-[#ffffff]" onClick={() => write({ ...values, [key]: 0 })}>
                    Reset
                  </button>
                </span>
              </span>
              <input
                type="range"
                min={-100}
                max={100}
                step={1}
                value={values[key]}
                aria-label={LABELS[key]}
                onChange={(event) => write({ ...values, [key]: Number(event.target.value) })}
                className="w-full accent-[#ffffff]"
              />
            </label>
          ))}
          <QuietButton onClick={() => write({ ...ZERO })}>Reset all</QuietButton>
        </div>
      </div>
    </PanelBody>
  );
}
