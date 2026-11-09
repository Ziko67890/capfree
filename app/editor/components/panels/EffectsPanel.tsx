"use client";

import { useState } from "react";
import { useTimelineEngine } from "@elah/editor";
import { EFFECT_PRESETS } from "../../catalog";
import { applyEffectPreset, clearClipEffects } from "../../clipEdit";
import { EFFECT_LOOKS, SAMPLE_PHOTO_TALL } from "../../visuals";
import { usePreviewLook } from "../../previewLook";
import { EmptyNote, PanelBody, QuietButton, SearchField, SubTabs } from "../chrome";
import { useToast } from "../toast";

const MODES = ["Preview look", "Clip effect"] as const;

export function EffectsPanel() {
  const engine = useTimelineEngine();
  const look = usePreviewLook();
  const toast = useToast();
  const [mode, setMode] = useState<(typeof MODES)[number]>("Preview look");
  const [query, setQuery] = useState("");
  const cards = EFFECT_LOOKS.filter((item) => item.name.toLowerCase().includes(query.trim().toLowerCase()));

  function applyToClip(presetId: string) {
    const preset = EFFECT_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    const error = applyEffectPreset(engine, preset);
    if (error) toast(error, "error");
    else toast(`${preset.label} applied to the clip`);
  }

  function clearClip() {
    const error = clearClipEffects(engine);
    if (error) toast(error, "error");
    else toast("Clip effects cleared");
  }

  if (mode === "Clip effect") {
    return (
      <PanelBody>
        <div className="-mx-2 -mt-2 mb-2">
          <SubTabs tabs={MODES} value={mode} onChange={(next) => setMode(next as typeof mode)} />
        </div>
        <p className="mb-2 text-[11px] leading-snug text-[#888899]">
          Renders on the selected clip through the engine, so it survives export. Select a clip first.
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
      </PanelBody>
    );
  }

  return (
    <PanelBody>
      <div className="-mx-2 -mt-2 mb-2">
        <SubTabs tabs={MODES} value={mode} onChange={(next) => setMode(next as typeof mode)} />
      </div>
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
              look.activeEffect === card.name ? "ring-2 ring-[#ffffff]" : "hover:ring-1 hover:ring-[#ffffff]"
            }`}
            style={{ aspectRatio: "2 / 3" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={SAMPLE_PHOTO_TALL} alt={card.name} className={`h-full w-full object-cover ${card.cls}`} />
            {card.overlay === "scan" && <span className="capfree-scan pointer-events-none absolute inset-0" />}
            {card.overlay === "grain" && <span className="capfree-grain pointer-events-none absolute inset-0" />}
            {card.overlay === "vignette" && <span className="capfree-vignette pointer-events-none absolute inset-0" />}
            <span className="absolute inset-x-0 bottom-0 bg-black/60 px-1 py-1 text-[10px] text-white">{card.name}</span>
          </button>
        ))}
      </div>
    </PanelBody>
  );
}
