"use client";

import { useMemo, useState } from "react";
import { PanelBody, PreviewBanner, SearchField } from "../chrome";

const SEED = [
  { id: "1", word: "Hey", start: 0.12 },
  { id: "2", word: "everyone", start: 0.4 },
  { id: "3", word: "welcome", start: 0.92 },
  { id: "4", word: "back", start: 1.3 },
  { id: "5", word: "to", start: 1.5 },
  { id: "6", word: "the", start: 1.62 },
  { id: "7", word: "channel", start: 1.8 },
  { id: "8", word: "today", start: 2.4 },
  { id: "9", word: "we", start: 2.7 },
  { id: "10", word: "are", start: 2.86 },
  { id: "11", word: "editing", start: 3.1 },
  { id: "12", word: "this", start: 3.6 },
  { id: "13", word: "clip", start: 3.86 },
];

export function TranscriptPanel({ fps: _fps }: { fps: number }) {
  const [words, setWords] = useState(SEED);
  const [query, setQuery] = useState("");
  const shown = useMemo(
    () => words.filter((word) => word.word.toLowerCase().includes(query.trim().toLowerCase())),
    [query, words],
  );

  return (
    <PanelBody>
      <PreviewBanner />
      <SearchField value={query} onChange={setQuery} placeholder="Search words" />
      <div className="mt-2 flex flex-wrap gap-1">
        {shown.map((word) => (
          <button
            key={word.id}
            type="button"
            onClick={() => setWords((current) => current.filter((item) => item.id !== word.id))}
            className="rounded-md bg-[#1e1e24] px-2 py-1 text-[11px] text-white"
            title="Delete word"
          >
            {word.word}
            <span className="ml-1 font-mono text-[9px] text-[#888899]">{word.start.toFixed(1)}</span>
          </button>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-[#888899]">Delete word removes it locally only.</p>
    </PanelBody>
  );
}
