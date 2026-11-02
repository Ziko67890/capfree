"use client";

import { useEffect, useState } from "react";
import { useTimelineEngine } from "@elah/editor";
import { addImageUrl } from "../../placeMedia";
import { fetchStickers, STICKER_CATEGORIES, type GiphySticker } from "../../visuals";
import { CategoryLayout, EmptyNote, SearchField, SkeletonGrid } from "../chrome";
import { useToast } from "../toast";

interface StickersPanelProps {
  fps: number;
}

interface StickerResult {
  token: string;
  items: GiphySticker[];
  error: string | null;
}

export function StickersPanel({ fps }: StickersPanelProps) {
  const engine = useTimelineEngine();
  const toast = useToast();
  const [category, setCategory] = useState<string>("Trending");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [result, setResult] = useState<StickerResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [query]);

  const cacheKey = debounced ? `search:${debounced}` : category;
  const token = `${cacheKey}#${retry}`;

  // Loading is derived, not stored: anything older than the current token is
  // still in flight, so the effect only ever writes state asynchronously.
  const loading = result?.token !== token;
  const stickers = loading ? [] : result.items;
  const error = loading ? null : result.error;

  useEffect(() => {
    let cancelled = false;
    fetchStickers(cacheKey)
      .then((items) => {
        if (!cancelled) setResult({ token, items, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setResult({
          token,
          items: [],
          error: err instanceof Error ? err.message : "Could not load stickers.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [cacheKey, token]);

  async function add(sticker: GiphySticker) {
    setBusy(sticker.id);
    try {
      const id = await addImageUrl(engine, sticker.full, sticker.title, fps * 3);
      if (!id) toast("Could not add that sticker.", "error");
      else toast(`${sticker.title} added`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not add that sticker.", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <CategoryLayout
      categories={STICKER_CATEGORIES}
      category={category}
      onCategory={setCategory}
      search={<SearchField value={query} onChange={setQuery} placeholder="Search stickers" />}
    >
      {loading ? (
        <SkeletonGrid count={12} />
      ) : error ? (
        <div className="flex flex-col items-center gap-2 py-6">
          <p className="text-center text-[12px] text-[#888899]">{error}</p>
          <button
            type="button"
            onClick={() => setRetry((count) => count + 1)}
            className="rounded-md bg-[#00d4b4] px-3 py-1.5 text-[12px] font-semibold text-black"
          >
            Retry
          </button>
        </div>
      ) : stickers.length === 0 ? (
        <EmptyNote text="No stickers in this category." />
      ) : (
        <div className="grid grid-cols-4 gap-1.5">
          {stickers.map((sticker) => (
            <button
              key={sticker.id}
              type="button"
              disabled={busy === sticker.id}
              onClick={() => void add(sticker)}
              className="flex flex-col gap-1 overflow-hidden rounded-md bg-[#2a2a30] p-0.5 text-white transition duration-150 hover:scale-[1.04] hover:border hover:border-[#00d4b4] disabled:opacity-50"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={sticker.preview} alt={sticker.title} className="aspect-square w-full object-contain" />
              <span className="line-clamp-1 px-0.5 text-center text-[9px] text-[#c8c8ce]">{sticker.title}</span>
            </button>
          ))}
        </div>
      )}
    </CategoryLayout>
  );
}
