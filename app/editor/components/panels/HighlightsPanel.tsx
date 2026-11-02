"use client";

import { useState } from "react";
import { useTimelineEngine } from "@elah/editor";
import { placeTextClip } from "../../clipEdit";
import { PanelBody, PreviewBanner } from "../chrome";
import { useToast } from "../toast";

const RANGES = [
  { id: "h1", label: "Hook", start: "0:02", end: "0:06", score: 92, text: "Highlight 1" },
  { id: "h2", label: "Peak", start: "0:11", end: "0:16", score: 81, text: "Highlight 2" },
  { id: "h3", label: "Quote", start: "0:21", end: "0:25", score: 74, text: "Highlight 3" },
  { id: "h4", label: "Close", start: "0:40", end: "0:45", score: 68, text: "Highlight 4" },
];

export function HighlightsPanel({ fps }: { fps: number }) {
  const engine = useTimelineEngine();
  const toast = useToast();
  const [picked, setPicked] = useState<Set<string>>(new Set(["h1", "h2"]));

  function addLocal() {
    for (const item of RANGES.filter((range) => picked.has(range.id))) {
      placeTextClip(engine, fps, item.text, { durationSec: 3, fontSize: 56 });
    }
    toast("Highlights added locally");
  }

  return (
    <PanelBody>
      <PreviewBanner />
      <ul className="flex flex-col gap-2">
        {RANGES.map((item) => (
          <li key={item.id} className="flex items-center gap-2 rounded-md bg-[#1e1e24] p-2">
            <input
              type="checkbox"
              checked={picked.has(item.id)}
              aria-label={item.label}
              onChange={() =>
                setPicked((current) => {
                  const next = new Set(current);
                  if (next.has(item.id)) next.delete(item.id);
                  else next.add(item.id);
                  return next;
                })
              }
              className="accent-[#00d4b4]"
            />
            <span className="min-w-0 flex-1">
              <span className="flex justify-between text-[12px] text-white">
                <span>{item.label}</span>
                <span className="font-mono text-[10px] text-[#888899]">
                  {item.start}–{item.end}
                </span>
              </span>
              <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-[#111114]">
                <span className="block h-full bg-[#00d4b4]" style={{ width: `${item.score}%` }} />
              </span>
            </span>
            <span className="text-[10px] text-[#888899]">{item.score}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={addLocal}
        className="mt-3 h-8 w-full rounded-md bg-[#00d4b4] text-[12px] font-semibold text-black"
      >
        Add to timeline
      </button>
    </PanelBody>
  );
}
