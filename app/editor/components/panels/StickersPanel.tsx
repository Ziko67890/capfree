"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { useTimelineEngine } from "@elah/editor";
import { searchStickers, type StockSticker } from "../../api";
import { addImageUrl } from "../../placeMedia";
import { STICKER_CATEGORIES, STICKER_QUERY } from "../../visuals";
import { CategoryLayout, EmptyNote, SearchField, SkeletonGrid, Spinner } from "../chrome";
import { useToast } from "../toast";

interface StickersPanelProps {
  fps: number;
}

interface StickerResult {
  token: string;
  items: StockSticker[];
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

  const term = debounced || STICKER_QUERY[category] || category;
  const token = `${term}#${retry}`;

  // Loading is derived, not stored: anything older than the current token is
  // still in flight, so the effect only ever writes state asynchronously.
  const loading = result?.token !== token;
  const stickers = loading ? [] : result.items;
  const error = loading ? null : result.error;

  useEffect(() => {
    let cancelled = false;
    searchStickers(term)
      .then((items) => {
        if (!cancelled) setResult({ token, items, error: null });
      })
      .catch((err: unknown) => {
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
  }, [term, token]);

  async function add(sticker: StockSticker) {
    setBusy(sticker.id);
    try {
      const id = await addImageUrl(engine, sticker.url, sticker.name, fps * 3);
      if (!id) toast("Could not add that sticker.", "error");
      else toast(`${sticker.name} added`);
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
            className="rounded-md bg-[#ffffff] px-3 py-1.5 text-[12px] font-semibold text-black"
          >
            Retry
          </button>
        </div>
      ) : stickers.length === 0 ? (
        <EmptyNote text="No stickers in this category." />
      ) : (
        <>
          <div className="grid grid-cols-4 gap-1.5">
            {stickers.map((sticker) => (
              <div
                key={sticker.id}
                className="group relative overflow-hidden rounded-md bg-[#2a2a30] p-0.5 transition duration-150 hover:ring-1 hover:ring-[#ffffff]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={sticker.previewUrl}
                  alt={sticker.name}
                  loading="lazy"
                  className="aspect-square w-full object-contain"
                />
                <button
                  type="button"
                  disabled={busy === sticker.id}
                  onClick={() => void add(sticker)}
                  aria-label={`Add ${sticker.name} to the canvas`}
                  className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-[#ffffff] text-black opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-50"
                >
                  {busy === sticker.id ? <Spinner /> : <Plus className="h-3 w-3" />}
                </button>
              </div>
            ))}
          </div>
          <p className="mt-2 text-center text-[9px] leading-snug text-[#888899]">
            Pixabay — free for commercial use, no credit required
          </p>
        </>
      )}
    </CategoryLayout>
  );
}
