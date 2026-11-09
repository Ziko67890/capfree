"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, ExternalLink, Pause, Play, Plus, Search } from "lucide-react";
import { playbackStore, useTimelineEngine } from "@elah/editor";
import { requestMusicTrack, searchMusic, type MusicTrack } from "../../api";
import { addAudioBlob } from "../../placeMedia";
import { albumArt, initials } from "../../visuals";
import { EmptyNote, ErrorNote, Spinner } from "../chrome";
import { useToast } from "../toast";

/** What the panel searches before the user has asked for anything. */
const OPENING_SEARCH = "instrumental";

/** Seeds for the quick chips; each one is just a search. */
const MOODS = [
  "upbeat",
  "chill",
  "hip hop",
  "cinematic",
  "lo-fi",
  "acoustic",
  "electronic",
  "ambient",
  "jazz",
  "rock",
] as const;

/**
 * Stands in for a card while a search is in flight. Mirrors the real row's
 * geometry -- 40px thumb, two text lines, a badge line -- so the list does not
 * jump when results replace it.
 */
function SkeletonCard() {
  return (
    <li aria-hidden className="animate-pulse rounded-md border border-[#2a2a30] bg-[#1a1a1e] p-2">
      <div className="flex items-center gap-2">
        <span className="h-10 w-10 shrink-0 rounded-md bg-[#2a2a30]" />
        <span className="min-w-0 flex-1">
          <span className="block h-[11px] w-3/5 rounded bg-[#2a2a30]" />
          <span className="mt-1.5 block h-[9px] w-2/5 rounded bg-[#2a2a30]" />
          <span className="mt-1.5 block h-[11px] w-16 rounded bg-[#2a2a30]" />
        </span>
        <span className="h-7 w-7 shrink-0 rounded-full bg-[#2a2a30]" />
        <span className="h-7 w-7 shrink-0 rounded-full bg-[#2a2a30]" />
      </div>
    </li>
  );
}

function clock(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

function Thumb({ name }: { name: string }) {
  const art = albumArt(name);
  return (
    <span
      aria-hidden
      className="grid h-10 w-10 shrink-0 place-items-center rounded-md text-[10px] font-bold text-white"
      style={{ background: `linear-gradient(145deg, ${art.from}, ${art.to})` }}
    >
      {initials(name)}
    </span>
  );
}

function Equalizer() {
  return (
    <span className="flex h-3 items-end gap-[2px]" aria-hidden>
      {[5, 9, 6, 11, 7].map((height, index) => (
        <span
          key={index}
          className="capfree-eq w-[2px] rounded-sm bg-[#ffffff]"
          style={{ height: `${height}px` }}
        />
      ))}
    </span>
  );
}

function TrackRow({
  track,
  playing,
  adding,
  copied,
  onToggle,
  onAdd,
  onCopy,
}: {
  track: MusicTrack;
  playing: boolean;
  adding: boolean;
  copied: boolean;
  onToggle: () => void;
  onAdd: () => void;
  onCopy: () => void;
}) {
  const meta = [track.artist, clock(track.duration)];
  if (track.bpm) meta.push(`${track.bpm} BPM`);

  return (
    <li className="rounded-md border border-[#2a2a30] bg-[#1a1a1e] p-2 transition-colors duration-150 hover:border-[#3a3a42]">
      <div className="flex items-center gap-2">
        <Thumb name={track.title} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5">
            <span className="truncate text-[12px] font-semibold text-white">{track.title}</span>
            {playing && <Equalizer />}
          </p>
          <p className="truncate text-[10px] text-[#888899]">{meta.join(" · ")}</p>
          <p className="mt-1 flex flex-wrap items-center gap-1">
            {/* The real licence, not a blanket claim: BY and BY-SA have strings attached. */}
            <span className="rounded-[4px] border border-[#3a3a42] px-1 py-px text-[9px] leading-none text-[#c8c8ce]">
              {track.licenseLabel}
            </span>
            {!track.requiresAttribution && (
              <span className="rounded-[4px] bg-[#ffffff] px-1 py-px text-[9px] font-semibold leading-none text-black">
                Free to use
              </span>
            )}
            {track.genres.slice(0, 2).map((genre) => (
              <span key={genre} className="text-[9px] text-[#888899]">
                {genre}
              </span>
            ))}
          </p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-label={playing ? `Pause ${track.title}` : `Preview ${track.title}`}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#2a2a30] text-white transition-colors duration-150 hover:bg-[#3a3a42]"
        >
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={onAdd}
          disabled={adding}
          aria-label={`Add ${track.title} to the timeline`}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#ffffff] text-black transition-colors duration-150 hover:bg-[#e6e6e6] disabled:opacity-50"
        >
          {adding ? <Spinner /> : <Plus className="h-3.5 w-3.5" />}
        </button>
      </div>

      {track.requiresAttribution && (
        <div className="mt-1.5 flex items-start gap-1.5 border-t border-[#2a2a30] pt-1.5">
          <p className="min-w-0 flex-1 text-[9px] leading-snug text-[#888899]">
            Credit required — {track.licenseLabel}
          </p>
          <button
            type="button"
            onClick={onCopy}
            className="flex shrink-0 items-center gap-1 rounded-[4px] border border-[#3a3a42] px-1.5 py-0.5 text-[9px] text-[#c8c8ce] transition-colors duration-150 hover:border-[#ffffff] hover:text-white"
          >
            {copied ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5" />}
            {copied ? "Copied" : "Copy credit"}
          </button>
          {track.sourceUrl && (
            <a
              href={track.sourceUrl}
              target="_blank"
              rel="noreferrer noopener"
              aria-label={`Open ${track.title} on ${track.provider}`}
              className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[4px] border border-[#3a3a42] text-[#c8c8ce] transition-colors duration-150 hover:border-[#ffffff] hover:text-white"
            >
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          )}
        </div>
      )}
    </li>
  );
}

/** One settled search. Pages accumulate into `tracks` as the user asks for more. */
interface MusicResult {
  token: string;
  tracks: MusicTrack[];
  pageCount: number;
  source: string;
  error: string | null;
}

/** A settled search worth keeping, plus how many pages deep it goes. */
type CachedSearch = Omit<MusicResult, "token" | "error"> & { page: number };

/**
 * Searches already answered this session, keyed by term, and the accumulator
 * that "Load more" appends onto. Module-level on purpose: it outlives the
 * component, so returning to a term costs nothing. Deliberately not persisted
 * -- a dead preview URL or a changed licence should not survive a reload.
 */
const CACHE = new Map<string, CachedSearch>();

export function MusicPanel() {
  const engine = useTimelineEngine();
  const toast = useToast();

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [query, setQuery] = useState(OPENING_SEARCH);
  const [term, setTerm] = useState(OPENING_SEARCH);
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<MusicResult | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // One element for the whole panel, so a second preview replaces the first.
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  // Loading is derived rather than stored, which keeps the fetch effect to a
  // single asynchronous write: anything whose token is stale is still in flight.
  const token = `${term}#${page}#${retry}`;
  const pending = result?.token !== token;

  // A retry is an explicit "ask again", so it ignores what was cached.
  const cached = retry === 0 ? CACHE.get(term) : undefined;
  const hit = cached && cached.page >= page ? cached : undefined;
  const hasHit = hit !== undefined;
  // Fresh results win; otherwise a cached term renders at once, so no skeleton
  // is shown for a search this session has already answered.
  const view = pending ? hit : result;

  const searching = pending && !hasHit && page === 1;
  const loadingMore = pending && !hasHit && page > 1;
  const tracks = view?.tracks ?? [];
  const pageCount = view?.pageCount ?? 0;
  const error = pending ? null : result.error;
  const onBackup = view?.source === "freesound";

  useEffect(() => {
    if (hasHit) return;
    let cancelled = false;
    searchMusic(term, page)
      .then((fresh) => {
        if (cancelled) return;
        // The cache is the accumulator, so "Load more" appends onto whatever
        // pages of this term have already landed.
        const base = page > 1 ? (CACHE.get(term)?.tracks ?? []) : [];
        const merged = [...base, ...fresh.tracks];
        CACHE.set(term, {
          tracks: merged,
          pageCount: fresh.pageCount,
          source: fresh.source,
          page,
        });
        setResult({
          token,
          tracks: merged,
          pageCount: fresh.pageCount,
          source: fresh.source,
          error: null,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // A failed "load more" should leave what is already on screen alone.
        const keep = page > 1 ? CACHE.get(term) : undefined;
        setResult({
          token,
          tracks: keep?.tracks ?? [],
          pageCount: keep?.pageCount ?? 0,
          source: keep?.source ?? "openverse",
          error: err instanceof Error ? err.message : "Music search failed",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [term, page, token, hasHit]);

  function submit(text: string) {
    const next = text.trim();
    setQuery(text);
    setTerm(next);
    // Resuming a cached term starts at the depth already loaded, so the first
    // "Load more" asks for a page that is genuinely new.
    setPage(CACHE.get(next)?.page ?? 1);
    // Clears the retry counter so a term that is cached can be served from it.
    setRetry(0);
  }

  function togglePreview(track: MusicTrack) {
    const current = audioRef.current;
    if (playing === track.id && current) {
      current.pause();
      setPlaying(null);
      return;
    }
    current?.pause();

    const audio = new Audio(track.previewUrl);
    audioRef.current = audio;
    audio.addEventListener("ended", () => setPlaying((id) => (id === track.id ? null : id)));
    void audio
      .play()
      .then(() => setPlaying(track.id))
      .catch(() => toast("Could not play that preview.", "error"));
  }

  async function add(track: MusicTrack) {
    if (adding) return;
    setAdding(track.id);
    try {
      const blob = await requestMusicTrack(track.previewUrl);
      const clipId = await addAudioBlob(
        engine,
        blob,
        track.title,
        playbackStore.getState().currentFrame,
      );
      if (!clipId) throw new Error("Could not place that track on the timeline.");
      toast(
        track.requiresAttribution
          ? `${track.title} added — remember to credit ${track.artist}`
          : `${track.title} added`,
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not add that track.", "error");
    } finally {
      setAdding(null);
    }
  }

  async function copyCredit(track: MusicTrack) {
    const text =
      track.attribution ||
      `"${track.title}" by ${track.artist} — ${track.licenseLabel}${
        track.licenseUrl ? ` (${track.licenseUrl})` : ""
      }`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(track.id);
      window.setTimeout(() => setCopied((id) => (id === track.id ? null : id)), 1600);
    } catch {
      toast("Could not copy the credit line.", "error");
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#111114]">
      <div className="shrink-0 px-2 pb-1 pt-2">
        <h2 className="text-[13px] font-semibold text-white">Royalty-Free Music</h2>
        <p className="mt-0.5 text-[10px] leading-snug text-[#888899]">
          All tracks are free for commercial use. Some ask for a credit line — each card says
          which.
        </p>
      </div>

      <form
        className="relative shrink-0 px-2 pb-1.5 pt-1"
        onSubmit={(event) => {
          event.preventDefault();
          submit(query);
        }}
      >
        <Search
          className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#888899]"
          aria-hidden
        />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search music"
          aria-label="Search royalty-free music"
          className="h-8 w-full rounded-md border border-[#2a2a30] bg-[#1a1a1e] pl-8 pr-2 text-[12px] text-white outline-none transition-colors duration-150 placeholder:text-[#888899] focus:border-[#ffffff]"
        />
      </form>

      <div className="capfree-scroll flex shrink-0 gap-1 overflow-x-auto px-2 pb-1.5">
        {MOODS.map((mood) => (
          <button
            key={mood}
            type="button"
            onClick={() => submit(mood)}
            aria-pressed={term === mood}
            className={`shrink-0 rounded-full px-2 py-1 text-[11px] transition-colors duration-150 ${
              term === mood ? "bg-[#ffffff] text-black" : "bg-[#2a2a30] text-[#c8c8ce] hover:text-white"
            }`}
          >
            {mood}
          </button>
        ))}
      </div>

      <div className="capfree-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {error && <ErrorNote text={error} />}
        {onBackup && (
          <p className="mb-2 rounded-md bg-[#1e1e24] px-2 py-1.5 text-[10px] leading-snug text-[#c8c8ce]">
            Showing Freesound results — the main library could not be reached.
          </p>
        )}

        {searching ? (
          <ul className="flex flex-col gap-1.5">
            {Array.from({ length: 4 }, (_, index) => (
              <SkeletonCard key={index} />
            ))}
          </ul>
        ) : tracks.length === 0 ? (
          error ? (
            <button
              type="button"
              onClick={() => setRetry((count) => count + 1)}
              className="h-8 w-full rounded-md bg-[#2a2a30] text-[12px] text-white transition-colors duration-150 hover:bg-[#3a3a42]"
            >
              Try again
            </button>
          ) : (
            <EmptyNote text="No tracks matched that search." />
          )
        ) : (
          <>
            <ul className="flex flex-col gap-1.5">
              {tracks.map((track) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  playing={playing === track.id}
                  adding={adding === track.id}
                  copied={copied === track.id}
                  onToggle={() => togglePreview(track)}
                  onAdd={() => void add(track)}
                  onCopy={() => void copyCredit(track)}
                />
              ))}
            </ul>
            {page < pageCount && (
              <button
                type="button"
                onClick={() => setPage((current) => current + 1)}
                disabled={loadingMore}
                className="mt-1.5 flex h-8 w-full items-center justify-center gap-2 rounded-md bg-[#2a2a30] text-[12px] text-white transition-colors duration-150 hover:bg-[#3a3a42] disabled:opacity-50"
              >
                {loadingMore && <Spinner />}
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
