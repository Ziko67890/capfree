"use client";

import { useState } from "react";
import { Layers, RotateCcw } from "lucide-react";
import { playbackStore, useTimelineEngine } from "@elah/editor";
import { EFFECT_PRESETS, type FilterPreset } from "../../catalog";
import {
  adjustmentEffects,
  applyEffectPreset,
  applyFilterPreset,
  clearClipEffects,
  ensureTrack,
  readAdjustments,
  readGamma,
  selectClip,
  type AdjustmentValues,
} from "../../clipEdit";
import { useSelectedClip } from "../../useSelectedClip";
import { EFFECT_LOOKS, SAMPLE_PHOTO_TALL } from "../../visuals";
import { usePreviewLook } from "../../previewLook";
import { EmptyNote, PanelBody, QuietButton, SearchField, SubTabs } from "../chrome";
import { useToast } from "../toast";

const MODES = ["Adjust", "Effects"] as const;

const ZERO: AdjustmentValues = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  sharpness: 0,
  vignette: 0,
  temperature: 0,
  tint: 0,
  highlights: 0,
  shadows: 0,
  grain: 0,
};

/**
 * Each slider's range and floor. Sharpness starts at 0 rather than -100: the
 * registry has no unsharp mask, so positive values ride the colour grade's
 * gamma, and the negative half of that control is blur, which lives with the
 * other effects below.
 */
const SLIDERS: ReadonlyArray<{ key: keyof AdjustmentValues; label: string; min: number }> = [
  { key: "brightness", label: "Brightness", min: -100 },
  { key: "contrast", label: "Contrast", min: -100 },
  { key: "saturation", label: "Saturation", min: -100 },
  { key: "sharpness", label: "Sharpness", min: 0 },
  // Carried over from the Adjustment panel, now writing real clip effects
  // rather than a preview-only CSS filter.
  { key: "highlights", label: "Highlights", min: -100 },
  { key: "shadows", label: "Shadows", min: -100 },
  { key: "temperature", label: "Warmth", min: -100 },
  { key: "tint", label: "Tint", min: -100 },
  { key: "vignette", label: "Vignette", min: 0 },
  { key: "grain", label: "Grain", min: 0 },
];

/**
 * Local to this panel so the Filters panel's own catalogue is left alone.
 * Every param name and preset id below is one the colourGrade effect actually
 * declares, so none of them is a no-op.
 */
const FILTER_CARDS: FilterPreset[] = [
  {
    id: "cinematic",
    label: "Cinematic",
    swatch: "linear-gradient(135deg,#0e7490,#ea580c)",
    presetId: "teal-orange",
  },
  {
    id: "vintage",
    label: "Vintage",
    swatch: "linear-gradient(135deg,#8c6f4a,#d8c7a1)",
    params: { contrast: 0.95, saturation: 0.78, temperature: 0.28, lift: 0.06, gain: 1.03 },
  },
  {
    id: "cool",
    label: "Cool",
    swatch: "linear-gradient(135deg,#4a7f9c,#9ec9dd)",
    params: { temperature: -0.45, tint: 0.08, saturation: 0.95 },
  },
  {
    id: "warm",
    label: "Warm",
    swatch: "linear-gradient(135deg,#c47a3a,#e8b878)",
    params: { temperature: 0.45, saturation: 1.08, contrast: 1.05 },
  },
  {
    id: "fade",
    label: "Fade",
    swatch: "linear-gradient(135deg,#9a9aa2,#d5d5da)",
    presetId: "film-fade",
  },
  { id: "bw", label: "B&W", swatch: "linear-gradient(135deg,#2b2b2b,#b4b4b4)", presetId: "noir" },
  {
    id: "vivid",
    label: "Vivid",
    swatch: "linear-gradient(135deg,#e23d6a,#f4a63a)",
    params: { saturation: 1.65, contrast: 1.12, gain: 1.05 },
  },
];

function AdjustSlider({
  label,
  min,
  value,
  onChange,
  onCommit,
}: {
  label: string;
  min: number;
  value: number;
  onChange: (value: number) => void;
  onCommit: () => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-[11px] text-[#c8c8ce]">
      <span className="flex items-center justify-between">
        {label}
        <span className="font-mono text-[#888899]">{value > 0 ? `+${value}` : value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={100}
        step={1}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(Number(event.target.value))}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
        className="w-full accent-[#ffffff]"
      />
    </label>
  );
}

export function EffectsPanel({ fps }: { fps: number }) {
  const engine = useTimelineEngine();
  const look = usePreviewLook();
  const toast = useToast();
  const selected = useSelectedClip();
  const [mode, setMode] = useState<string>("Adjust");
  const [query, setQuery] = useState("");
  const [values, setValues] = useState<AdjustmentValues>(ZERO);
  const [seed, setSeed] = useState("");

  const cards = EFFECT_LOOKS.filter((item) =>
    item.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  // Adjustments live on the clip as effects, so the sliders are re-seeded from
  // whatever the newly selected clip already carries.
  const target = selected && selected.clip.type !== "audio" ? selected : null;
  const seedKey = target?.clip.id ?? "";
  if (seed !== seedKey) {
    setSeed(seedKey);
    setValues(target ? readAdjustments(target.clip) : ZERO);
  }

  /** Writes the five values onto the clip as real engine effects. */
  function write(next: AdjustmentValues, commit: boolean) {
    if (!target) return;
    const effects = adjustmentEffects(target.clip.effects, next, readGamma(target.clip));
    if (commit) engine.updateClip(target.clip.id, target.trackId, { effects });
    else engine.previewClip(target.clip.id, target.trackId, { effects });
  }

  function slide(key: keyof AdjustmentValues, value: number) {
    const next = { ...values, [key]: value };
    setValues(next);
    write(next, false);
  }

  function reset() {
    setValues(ZERO);
    write(ZERO, true);
    toast("Adjustments reset");
  }

  function applyFilter(preset: FilterPreset) {
    const error = applyFilterPreset(engine, preset);
    if (error) toast(error, "error");
    else toast(`${preset.label} applied`);
  }

  function applyToClip(presetId: string) {
    const preset = EFFECT_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    const error = applyEffectPreset(engine, preset);
    if (error) toast(error, "error");
    else toast(`${preset.label} applied to the clip`);
  }

  /**
   * An adjustment layer, which grades whatever sits under it. Carried over from
   * the Adjustment panel; it is a real SDK clip type, not a preview trick.
   */
  function addAdjustmentLayer() {
    try {
      const trackId = ensureTrack(engine, "video", "Video 1");
      const clip = engine.addClip({
        type: "adjustment",
        trackId,
        name: "Adjustment",
        startFrame: playbackStore.getState().currentFrame,
        durationFrames: fps * 5,
      });
      selectClip(clip.id);
      toast("Adjustment layer added");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not add an adjustment.", "error");
    }
  }

  function clearClip() {
    const error = clearClipEffects(engine);
    if (error) toast(error, "error");
    else {
      setValues(ZERO);
      toast("Clip effects cleared");
    }
  }

  const tabs = (
    <div className="-mx-2 -mt-2 mb-2">
      <SubTabs tabs={MODES} value={mode} onChange={setMode} />
    </div>
  );

  if (mode === "Effects") {
    return (
      <PanelBody>
        {tabs}
        <p className="mb-2 text-[11px] leading-snug text-[#888899]">
          Renders on the selected clip through the engine, so it survives export. Select a clip
          first.
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          {EFFECT_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => applyToClip(preset.id)}
              className="rounded-md bg-[#2a2a30] px-2 py-2.5 text-[11px] text-white transition-colors duration-150 hover:bg-[#ffffff] hover:text-black"
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className="mt-3">
          <QuietButton onClick={clearClip} tone="danger">
            Clear clip effects
          </QuietButton>
        </div>

        <p className="mb-1 mt-4 text-[11px] text-[#888899]">Preview look</p>
        <div className="mb-2">
          <SearchField value={query} onChange={setQuery} placeholder="Search effects" />
        </div>
        {cards.length === 0 && <EmptyNote text={`No effect matches "${query.trim()}".`} />}
        <div className="grid grid-cols-2 gap-1.5">
          {cards.map((card) => (
            <button
              key={card.name}
              type="button"
              onClick={() => {
                look.setEffect(card.name, card.stillCss);
                toast(`${card.name} applied`);
              }}
              className={`group relative overflow-hidden rounded-md bg-black text-left ${
                look.activeEffect === card.name
                  ? "ring-2 ring-[#ffffff]"
                  : "hover:ring-1 hover:ring-[#ffffff]"
              }`}
              style={{ aspectRatio: "2 / 3" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={SAMPLE_PHOTO_TALL}
                alt={card.name}
                className={`h-full w-full object-cover ${card.cls}`}
              />
              {card.overlay === "scan" && (
                <span className="capfree-scan pointer-events-none absolute inset-0" />
              )}
              {card.overlay === "grain" && (
                <span className="capfree-grain pointer-events-none absolute inset-0" />
              )}
              {card.overlay === "vignette" && (
                <span className="capfree-vignette pointer-events-none absolute inset-0" />
              )}
              <span className="absolute inset-x-0 bottom-0 bg-black/60 px-1 py-1 text-[10px] text-white">
                {card.name}
              </span>
            </button>
          ))}
        </div>
      </PanelBody>
    );
  }

  return (
    <PanelBody>
      {tabs}

      {!target ? (
        <EmptyNote text="Select a clip to adjust" />
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[12px] font-semibold text-white">Adjust</h3>
            <button
              type="button"
              onClick={reset}
              className="flex items-center gap-1 rounded-[4px] border border-[#3a3a42] px-1.5 py-0.5 text-[10px] text-[#c8c8ce] transition-colors duration-150 hover:border-[#ffffff] hover:text-white"
            >
              <RotateCcw className="h-2.5 w-2.5" aria-hidden />
              Reset
            </button>
          </div>

          <div className="flex flex-col gap-2.5">
            {SLIDERS.map((row) => (
              <AdjustSlider
                key={row.key}
                label={row.label}
                min={row.min}
                value={values[row.key]}
                onChange={(value) => slide(row.key, value)}
                onCommit={() => write(values, true)}
              />
            ))}
          </div>

          <h3 className="mb-2 mt-4 text-[12px] font-semibold text-white">Filters</h3>
          <div className="grid grid-cols-2 gap-1.5">
            {FILTER_CARDS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyFilter(preset)}
                className="overflow-hidden rounded-md border border-[#2a2a30] bg-[#1a1a1e] text-left transition-colors duration-150 hover:border-[#ffffff]"
              >
                <span
                  aria-hidden
                  className="block h-10 w-full"
                  style={{ background: preset.swatch }}
                />
                <span className="block px-1.5 py-1 text-[10px] text-white">{preset.label}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-[10px] leading-snug text-[#888899]">
            Adjustments and filters both write the clip&apos;s colour grade, so a filter replaces
            the grade the sliders set.
          </p>

          <div className="mt-3">
            <QuietButton onClick={addAdjustmentLayer}>
              <Layers className="h-3.5 w-3.5" aria-hidden />
              Add adjustment layer
            </QuietButton>
          </div>
          <p className="mt-1 text-[10px] leading-snug text-[#888899]">
            Grades everything beneath it on the timeline, rather than one clip.
          </p>
        </>
      )}
    </PanelBody>
  );
}
