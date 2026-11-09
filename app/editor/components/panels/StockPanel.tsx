"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { useTimelineEngine } from "@elah/editor";
import { searchStockVideos, type StockVideo } from "../../api";
import { addVideoUrl } from "../../placeMedia";
import { EmptyNote, SearchField, SkeletonGrid, Spinner } from "../chrome";
import { useToast } from "../toast";

/** Left rail, same shape as the sticker categories. */
const STOCK_CATEGORIES = [
  "Trending",
  "Nature",
  "City",
  "People",
  "Business",
  "Technology",
  "Food",
  "Travel",
  "Sports",
  "Abstract",
  "Animals",
  "Ocean",
  "Sky",
  "Night",
] as const;

const STOCK_QUERY: Record<string, string> = {
  Trending: "background",
  Nature: "nature",
  City: "city",
  People: "people",
  Business: "business",
  Technology: "technology",
  Food: "food",
  Travel: "travel",
  Sports: "sports",
  Abstract: "abstract",
  Animals: "animals",
  Ocean: "ocean",
  Sky: "sky",
  Night: "night",
};

interface StockResult {
  token: string;
  items: StockVideo[];
  error: string | null;
}

function clock(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

/**
 * 1080p / 720p / 4K rather than a raw pixel count. Read off the short edge, as
 * resolution labels conventionally are, so portrait footage is not called 4K
 * just because it is 2560 tall.
 */
function quality(width: number, height: number): string {
  const edge = Math.min(width, height);
  if (edge >= 2160) return "4K";
  if (edge >= 1080) return "1080p";
  if (edge >= 720) return "720p";
  return `${edge}p`;
}

export function StockPanel() {
  const engine = useTimelineEngine();
  const toast = useToast();
  const [category, setCategory] = useState<string>("Trending");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [result, setResult] = useState<StockResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [query]);

  const term = debounced || STOCK_QUERY[category] || category;
  const token = `${term}#${retry}`;

  // Loading is derived, not stored, so the effect only writes asynchronously.
  const loading = result?.token !== token;
  const videos = loading ? [] : result.items;
  const error = loading ? null : result.error;

  useEffect(() => {
    let cancelled = false;
    searchStockVideos(term)
      .then((items) => {
        if (!cancelled) setResult({ token, items, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setResult({
          token,
          items: [],
          error: err instanceof Error ? err.message : "Could not load stock video.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [term, token]);

  async function add(video: StockVideo) {
    if (busy) return;
    setBusy(video.id);
    try {
      const id = await addVideoUrl(engine, video.url, video.name);
      if (!id) toast("Could not add that clip.", "error");
      else toast(`${video.name} added`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not add that clip.", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#111114]">
      <div className="shrink-0 px-2 pb-1 pt-2">
        <SearchField value={query} onChange={setQuery} placeholder="Search stock video" />
      </div>
      <div className="flex min-h-0 flex-1">
        <nav className="capfree-scroll h-full w-[104px] shrink-0 overflow-y-auto border-r border-[#2a2a30] py-1">
          {STOCK_CATEGORIES.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setCategory(item)}
              className={`w-full px-2 py-1.5 text-left text-[11px] leading-tight transition-colors duration-150 ${
                item === category
                  ? "bg-[#2a2a30] text-white"
                  : "text-[#888899] hover:bg-[#2a2a30] hover:text-white"
              }`}
            >
              {item}
            </button>
          ))}
        </nav>
        <div className="capfree-scroll min-h-0 flex-1 overflow-y-auto p-2">
          {loading ? (
            <SkeletonGrid count={6} columns={2} ratio="16 / 9" />
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
          ) : videos.length === 0 ? (
            <EmptyNote text="No stock clips matched that search." />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-1.5">
                {videos.map((video) => (
                  <div
                    key={video.id}
                    className="group relative overflow-hidden rounded-md bg-[#2a2a30] transition duration-150 hover:ring-1 hover:ring-[#ffffff]"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={video.thumbnail}
                      alt={video.name}
                      loading="lazy"
                      className="aspect-video w-full object-cover"
                    />
                    <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[9px] text-white">
                      {quality(video.width, video.height)}
                    </span>
                    <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 text-[9px] text-white">
                      {clock(video.duration)}
                    </span>
                    <button
                      type="button"
                      disabled={busy === video.id}
                      onClick={() => void add(video)}
                      aria-label={`Add ${video.name} to the timeline`}
                      className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-[#ffffff] text-black opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-50"
                    >
                      {busy === video.id ? <Spinner /> : <Plus className="h-3 w-3" />}
                    </button>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-center text-[9px] leading-snug text-[#888899]">
                Pixabay — free for commercial use, no credit required
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
