"use client";

import { useRef, useState } from "react";
import { Play } from "lucide-react";
import { insertMediaAsset, playbackStore, useMediaLibrary, useTimelineEngine } from "@elah/editor";
import { AUDIO_CATEGORIES, AUDIO_CATALOG, type CatalogTrack } from "../../data/audioCatalog";
import { addAudioUrl } from "../../placeMedia";
import { albumArt, initials } from "../../visuals";
import { CategoryLayout, EmptyNote, SearchField, Spinner } from "../chrome";
import { useToast } from "../toast";

let playingEl: HTMLAudioElement | null = null;

function Cover({ name }: { name: string }) {
  const art = albumArt(name);
  return (
    <span
      className="grid h-12 w-12 shrink-0 place-items-center rounded-md text-[11px] font-bold text-white"
      style={{ background: `linear-gradient(145deg, ${art.from}, ${art.to})` }}
    >
      {initials(name)}
    </span>
  );
}

export function AudioPanel() {
  const engine = useTimelineEngine();
  const library = useMediaLibrary();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<string>("Recommended");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [heard, setHeard] = useState<string | null>(null);

  const catalog = AUDIO_CATALOG.filter((track) => track.category === category).filter((track) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return (
      track.title.toLowerCase().includes(needle) ||
      track.artist.toLowerCase().includes(needle) ||
      track.tags.some((tag) => tag.includes(needle))
    );
  });

  function playMp3(track: CatalogTrack) {
    playingEl?.pause();
    const audio = new Audio(track.previewUrl);
    playingEl = audio;
    audio.addEventListener("ended", () => setHeard((id) => (id === track.id ? null : id)));
    void audio.play().then(() => setHeard(track.id)).catch(() => toast("Could not play that preview.", "error"));
  }

  async function addTrack(track: CatalogTrack) {
    setBusy(track.id);
    try {
      const placed = await addAudioUrl(engine, track.previewUrl, track.title, playbackStore.getState().currentFrame);
      if (!placed) toast("Could not add this track.", "error");
      else toast(`${track.title} added`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not add this track.", "error");
    } finally {
      setBusy(null);
    }
  }

  async function upload(file: File) {
    setBusy("upload");
    try {
      const result = await library.importFiles([file]);
      const asset = result.imported[0];
      if (!asset) {
        toast("Could not import that audio file.", "error");
        return;
      }
      await insertMediaAsset(engine, asset.id, { desiredStartFrame: playbackStore.getState().currentFrame });
      toast("Audio added");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not import that audio file.", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <CategoryLayout
      categories={AUDIO_CATEGORIES}
      category={category}
      onCategory={setCategory}
      search={<SearchField value={query} onChange={setQuery} placeholder="Search sounds" />}
      header={
        <div className="px-2 pt-2">
          <input
            ref={inputRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void upload(file);
            }}
          />
          <button
            type="button"
            disabled={busy === "upload"}
            onClick={() => inputRef.current?.click()}
            className="flex h-8 w-full items-center justify-center rounded-md bg-[#00d4b4] text-[12px] font-semibold text-black"
          >
            Upload Audio
          </button>
        </div>
      }
    >
      {query.trim() && catalog.length === 0 ? (
        <EmptyNote text="No sounds match" />
      ) : (
        <div className="grid grid-cols-2 gap-1.5">
          {catalog.map((track) => {
            const active = heard === track.id;
            return (
              <article
                key={track.id}
                className={`rounded-md bg-[#1e1e24] p-1.5 ${active ? "ring-2 ring-[#00d4b4]" : ""}`}
              >
                <button type="button" className="flex w-full items-start gap-1.5 text-left" onClick={() => void addTrack(track)}>
                  <Cover name={track.title} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] text-white">{track.title}</span>
                    <span className="block truncate text-[9px] text-[#888899]">
                      {track.artist} · {track.durationSec}s
                    </span>
                    {active && (
                      <span className="mt-1 flex h-2 items-end gap-px" aria-hidden>
                        {[4, 8, 5, 10, 6, 9, 3, 7].map((h, i) => (
                          <span key={i} className="capfree-eq w-0.5 bg-[#00d4b4]" style={{ height: `${h}px` }} />
                        ))}
                      </span>
                    )}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`Play ${track.title}`}
                  disabled={busy === track.id}
                  onClick={(event) => {
                    event.stopPropagation();
                    playMp3(track);
                  }}
                  className="mt-1 grid h-6 w-full place-items-center rounded bg-[#1a1a1e] text-white"
                >
                  {busy === track.id ? <Spinner /> : <Play className="h-3 w-3 fill-current" />}
                </button>
              </article>
            );
          })}
        </div>
      )}
    </CategoryLayout>
  );
}
