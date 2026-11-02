"use client";

import { useState } from "react";
import { applyTextTemplate, BUILT_IN_TEXT_TEMPLATES, useTimelineEngine } from "@elah/editor";
import { ensureTrack, placeTextClip } from "../../clipEdit";
import { TEMPLATE_CARDS, type TemplateCard } from "../../library";
import { templateGradient } from "../../visuals";
import { CategoryLayout, EmptyNote, SearchField, SubTabs } from "../chrome";
import { useToast } from "../toast";

const LAYOUT_CATEGORIES = ["Travel", "Food", "Gaming", "Fashion", "Fitness", "Love", "Birthday", "Cinematic"] as const;

interface TemplatesPanelProps {
  fps: number;
}

function clipCount(id: string): number {
  return 2 + (id.length % 4);
}

function Thumb({ card }: { card: TemplateCard }) {
  const look = templateGradient(card.category);
  return (
    <span className="relative block overflow-hidden rounded" style={{ aspectRatio: "9 / 16", background: look.background }}>
      {look.grain && <span className="capfree-grain absolute inset-0" />}
      <span className="absolute inset-x-2 top-[38%] text-center text-[11px] font-semibold leading-tight text-white drop-shadow">
        {card.title}
      </span>
      <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 text-[9px] text-white">{clipCount(card.id)} clips</span>
      <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[9px] text-white">{card.seconds}s</span>
    </span>
  );
}

export function TemplatesPanel({ fps }: TemplatesPanelProps) {
  const engine = useTimelineEngine();
  const toast = useToast();
  const [tab, setTab] = useState("Travel");
  const [category, setCategory] = useState("Travel");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<TemplateCard | null>(null);

  function chooseTab(next: string) {
    setTab(next);
    setCategory(next);
  }

  const cards = TEMPLATE_CARDS.filter((card) => card.category === category).filter((card) => {
    const needle = query.trim().toLowerCase();
    return !needle || card.title.toLowerCase().includes(needle);
  });

  function applyTemplate(card: TemplateCard) {
    ensureTrack(engine, "video", `${card.title} · A`);
    ensureTrack(engine, "audio", `${card.title} · music`);
    const clip = placeTextClip(engine, fps, card.title, { durationSec: Math.min(card.seconds, 8), fontSize: 72 });
    const template = BUILT_IN_TEXT_TEMPLATES.find((item) => item.id === "template-title-card");
    if (template) engine.updateClip(clip.id, clip.trackId, applyTextTemplate(template, clip));
    engine.updateClip(clip.id, clip.trackId, { name: `${card.category} · ${card.title}`, content: card.title });
    setOpen(null);
    toast(`${card.title} layout applied`);
  }

  return (
    <>
      <CategoryLayout
        categories={LAYOUT_CATEGORIES}
        category={category}
        onCategory={setCategory}
        search={<SearchField value={query} onChange={setQuery} placeholder="Search templates" />}
        header={<SubTabs tabs={["Travel", "Fashion", "Cinematic"]} value={tab} onChange={chooseTab} />}
      >
        {cards.length === 0 ? (
          <EmptyNote />
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {cards.map((card) => (
              <button
                key={card.id}
                type="button"
                onClick={() => setOpen(card)}
                className="rounded-md bg-[#2a2a30] p-1 text-left transition-colors duration-150 hover:bg-[#3a3a42]"
              >
                <Thumb card={card} />
              </button>
            ))}
          </div>
        )}
      </CategoryLayout>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-6" onClick={() => setOpen(null)}>
          <div className="w-[280px] rounded-lg bg-[#111114] p-3" onClick={(event) => event.stopPropagation()}>
            <div className="mx-auto w-36">
              <Thumb card={open} />
            </div>
            <p className="mt-3 text-[14px] font-semibold text-white">{open.title}</p>
            <p className="text-[12px] text-[#888899]">
              {clipCount(open.id)} clips · {open.seconds}s
            </p>
            <button
              type="button"
              onClick={() => applyTemplate(open)}
              className="mt-3 h-9 w-full rounded-md bg-[#00d4b4] text-[13px] font-semibold text-black"
            >
              Use template
            </button>
          </div>
        </div>
      )}
    </>
  );
}
