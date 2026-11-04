"use client";

import { useMemo, useState } from "react";
import { useTimelineEngine } from "@elah/editor";
import { FILTER_PRESETS } from "../../catalog";
import { applyFilterPreset } from "../../clipEdit";
import { FILTER_LOOKS, SAMPLE_PHOTO, mixFilter } from "../../visuals";
import { usePreviewLook } from "../../previewLook";
import { PanelBody, SearchField } from "../chrome";
import { useToast } from "../toast";

export function FiltersPanel() {
  const engine = useTimelineEngine();
  const look = usePreviewLook();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [intensity, setIntensity] = useState(100);

  const cards = useMemo(
    () => FILTER_LOOKS.filter((item) => item.name.toLowerCase().includes(query.trim().toLowerCase())),
    [query],
  );

  function apply(name: string, css: string) {
    const mixed = mixFilter(css, intensity);
    if (look.activeFilter === name && name !== "Original") look.setFilter(null, "");
    else look.setFilter(name, mixed === "none" ? "" : mixed);
  }

  function setLevel(next: number) {
    setIntensity(next);
    if (!look.activeFilter) return;
    const card = FILTER_LOOKS.find((item) => item.name === look.activeFilter);
    if (!card) return;
    const mixed = mixFilter(card.css, next);
    look.setFilter(card.name, mixed === "none" ? "" : mixed);
  }

  function gradeClip(presetId: string) {
    const preset = FILTER_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    const error = applyFilterPreset(engine, preset);
    if (error) toast(error, "error");
    else toast(`${preset.label} graded onto the clip`);
  }

  return (
    <PanelBody>
      <div className="mb-2">
        <SearchField value={query} onChange={setQuery} placeholder="Search filters" />
      </div>
      <p className="mb-1 text-[11px] text-[#888899]">Colour grade · selected clip</p>
      <div className="mb-3 flex gap-1.5">
        {FILTER_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => gradeClip(preset.id)}
            title={`${preset.label} — applies to the selected clip`}
            className="flex-1 overflow-hidden rounded-md ring-offset-1 ring-offset-[#111114] transition-all duration-150 hover:ring-2 hover:ring-[#ffffff]"
          >
            <span className="block h-7 w-full" style={{ background: preset.swatch }} />
            <span className="block bg-[#2a2a30] py-0.5 text-[9px] leading-tight text-white">{preset.label}</span>
          </button>
        ))}
      </div>
      <p className="mb-1 text-[11px] text-[#888899]">Preview look</p>
      <div className="grid grid-cols-2 gap-1.5">
        {cards.map((card) => {
          const active = look.activeFilter === card.name;
          return (
            <button
              key={card.name}
              type="button"
              onClick={() => apply(card.name, card.css)}
              className={`relative overflow-hidden rounded-md bg-[#2a2a30] transition-colors duration-150 ${
                active ? "ring-2 ring-[#ffffff]" : "hover:ring-1 hover:ring-[#ffffff]"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={SAMPLE_PHOTO}
                alt={card.name}
                className="h-[72px] w-full object-cover"
                style={{ filter: mixFilter(card.css, intensity) === "none" ? undefined : mixFilter(card.css, intensity) }}
              />
              <span className="absolute inset-x-0 bottom-0 bg-black/55 px-1 py-0.5 text-left text-[10px] text-white">
                {card.name}
              </span>
            </button>
          );
        })}
      </div>
      <label className="mt-3 flex flex-col gap-1 text-[11px] text-[#c8c8ce]">
        <span className="flex justify-between">
          Intensity <span className="font-mono">{intensity}</span>
        </span>
        <input
          type="range"
          min={0}
          max={100}
          value={intensity}
          aria-label="Filter intensity"
          onChange={(event) => setLevel(Number(event.target.value))}
          className="w-full accent-[#ffffff]"
        />
      </label>
    </PanelBody>
  );
}
