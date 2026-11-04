"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Pause, Play, Plus, Search, Square, Upload } from "lucide-react";
import { insertMediaAsset, playbackStore, useMediaLibrary, useTimelineEngine } from "@elah/editor";
import { readRecents, rememberRecent, type RecentAudio } from "../../audioRecents";
import { AUDIO_TABS, tracksForTab, trackMatchesQuery, type AudioTab } from "../../audioTabs";
import { addAudioBlob, addAudioUrl } from "../../placeMedia";
import { useAudioRecorder } from "../../useAudioRecorder";
import { albumArt, initials } from "../../visuals";
import { Spinner } from "../chrome";
import { useToast } from "../toast";

/** One row in the list, whether it came from the catalog or the user's library. */
interface AudioItem {
  id: string;
  title: string;
  artist: string;
  durationSec: number;
  previewUrl: string;
  /** Library audio inserts by asset; catalog audio is fetched from its URL. */
  assetId?: string;
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
  item,
  playing,
  adding,
  onToggle,
  onAdd,
}: {
  item: AudioItem;
  playing: boolean;
  adding: boolean;
  onToggle: () => void;
  onAdd: () => void;
}) {
  return (
    <li className="flex items-center gap-2 rounded-lg bg-[#2a2a2a] p-2">
      <Thumb name={item.title} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-semibold text-white">{item.title}</p>
        <div className="flex items-center gap-2">
          <p className="truncate text-[10px] text-[#8a8a8a]">
            {item.artist ? `${item.artist} · ` : ""}
            {clock(item.durationSec)}
          </p>
          {playing && <Equalizer />}
        </div>
      </div>
      <button
        type="button"
        onClick={onToggle}
        aria-label={playing ? `Pause ${item.title}` : `Play ${item.title}`}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[#3a3a3a] text-white transition-colors duration-150 hover:border-[#ffffff] hover:text-[#ffffff]"
      >
        {playing ? <Pause className="h-3 w-3 fill-current" /> : <Play className="h-3 w-3 fill-current" />}
      </button>
      <button
        type="button"
        onClick={onAdd}
        disabled={adding}
        aria-label={`Add ${item.title} at the playhead`}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#ffffff] text-black transition-opacity duration-150 hover:opacity-90 disabled:opacity-50"
      >
        {adding ? <Spinner /> : <Plus className="h-3.5 w-3.5" />}
      </button>
    </li>
  );
}

export function AudioPanel() {
  const engine = useTimelineEngine();
  const library = useMediaLibrary();
  const toast = useToast();

  const fileRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recordingCount = useRef(0);

  const [tab, setTab] = useState<AudioTab>("Recommended");
  const [query, setQuery] = useState("");
  const [playing, setPlaying] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [recents, setRecents] = useState<RecentAudio[]>(() => readRecents());

  // One element for the whole panel: starting a second preview replaces the
  // first rather than layering over it.
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  /** A finished recording goes onto a fresh audio track at the playhead. */
  const saveRecording = useCallback(
    async (blob: Blob) => {
      recordingCount.current += 1;
      const name = `Recording ${recordingCount.current}`;
      const track = engine.addTrack("audio", { name });
      const clipId = await addAudioBlob(
        engine,
        blob,
        name,
        playbackStore.getState().currentFrame,
        track.id,
      );
      if (!clipId) {
        engine.removeTrack(track.id);
        throw new Error("Could not place that recording.");
      }
      toast(`${name} added`);
    },
    [engine, toast],
  );

  const recorder = useAudioRecorder(saveRecording);

  useEffect(() => {
    if (recorder.error) toast(recorder.error, "error");
  }, [recorder.error, toast]);

  function togglePreview(item: AudioItem) {
    const current = audioRef.current;
    if (playing === item.id && current) {
      current.pause();
      setPlaying(null);
      return;
    }
    current?.pause();

    const audio = new Audio(item.previewUrl);
    audioRef.current = audio;
    audio.addEventListener("ended", () => setPlaying((id) => (id === item.id ? null : id)));
    void audio
      .play()
      .then(() => setPlaying(item.id))
      .catch(() => toast("Could not play that preview.", "error"));
  }

  async function add(item: AudioItem) {
    setAdding(item.id);
    try {
      const startFrame = playbackStore.getState().currentFrame;
      let clipId: string | null;
      if (item.assetId) {
        const result = await insertMediaAsset(engine, item.assetId, { desiredStartFrame: startFrame });
        clipId = result.ok && result.clipIds.length > 0 ? result.clipIds[0] : null;
      } else {
        clipId = await addAudioUrl(engine, item.previewUrl, item.title, startFrame);
      }
      if (!clipId) {
        toast("Could not add this track.", "error");
        return;
      }
      setRecents(
        rememberRecent({
          id: item.id,
          title: item.title,
          artist: item.artist,
          durationSec: item.durationSec,
          previewUrl: item.previewUrl,
          ...(item.assetId ? { assetId: item.assetId } : {}),
        }),
      );
      toast(`${item.title} added`);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not add this track.", "error");
    } finally {
      setAdding(null);
    }
  }

  async function upload(file: File) {
    setUploading(true);
    try {
      const result = await library.importFiles([file]);
      const asset = result.imported[0];
      if (!asset) {
        toast("Could not import that audio file.", "error");
        return;
      }
      await insertMediaAsset(engine, asset.id, {
        desiredStartFrame: playbackStore.getState().currentFrame,
      });
      toast("Audio added");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not import that audio file.", "error");
    } finally {
      setUploading(false);
    }
  }

  const needle = query.trim().toLowerCase();

  const items: AudioItem[] =
    tab === "My Audio"
      ? library.assets
          .filter((asset) => asset.kind === "audio")
          .filter((asset) => !needle || asset.name.toLowerCase().includes(needle))
          .map((asset) => ({
            id: asset.id,
            title: asset.name,
            artist: "My audio",
            durationSec: asset.durationSec,
            previewUrl: asset.src,
            assetId: asset.id,
          }))
      : tracksForTab(tab)
          .filter((track) => trackMatchesQuery(track, query))
          .map((track) => ({
            id: track.id,
            title: track.title,
            artist: track.artist,
            durationSec: track.durationSec,
            previewUrl: track.previewUrl,
          }));

  const recentItems: AudioItem[] = recents.map((entry) => ({
    id: entry.id,
    title: entry.title,
    artist: entry.artist,
    durationSec: entry.durationSec,
    previewUrl: entry.previewUrl,
    ...(entry.assetId ? { assetId: entry.assetId } : {}),
  }));

  const recording = recorder.state === "recording";

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#1a1a1a]">
      <div className="shrink-0 px-3 pt-3">
        <input
          ref={fileRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void upload(file);
          }}
        />
        <div className="flex gap-2">
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md bg-[#ffffff] text-[12px] font-semibold text-black transition-opacity duration-150 hover:opacity-90 disabled:opacity-50"
          >
            {uploading ? <Spinner /> : <Upload className="h-3.5 w-3.5" />}
            Upload Audio
          </button>
          <button
            type="button"
            disabled={recorder.state === "unsupported" || recorder.state === "saving"}
            onClick={() => (recording ? recorder.stop() : recorder.start())}
            title={
              recorder.state === "unsupported"
                ? "This browser has no microphone recording"
                : "Record onto a new audio track at the playhead"
            }
            className={`flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border text-[12px] font-semibold transition-colors duration-150 disabled:opacity-50 ${
              recording
                ? "border-red-500 bg-red-500/15 text-red-300"
                : "border-[#3a3a3a] bg-[#2a2a2a] text-white hover:border-[#ffffff]"
            }`}
          >
            {recorder.state === "saving" ? (
              <Spinner />
            ) : recording ? (
              <Square className="h-3 w-3 fill-current" />
            ) : (
              <Mic className="h-3.5 w-3.5" />
            )}
            {recording ? clock(recorder.seconds) : recorder.state === "saving" ? "Saving…" : "Record"}
          </button>
        </div>

        <div className="relative mt-2">
          <Search
            className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8a8a8a]"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search sounds"
            aria-label="Search sounds"
            className="h-8 w-full rounded-md border border-[#3a3a3a] bg-[#2a2a2a] pl-7 pr-2 text-[12px] text-white outline-none transition-colors duration-150 placeholder:text-[#8a8a8a] focus:border-[#ffffff]"
          />
        </div>

        <div className="capfree-scroll -mx-1 mt-2 flex gap-1 overflow-x-auto px-1 pb-2">
          {AUDIO_TABS.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={tab === item}
              onClick={() => setTab(item)}
              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] transition-colors duration-150 ${
                tab === item
                  ? "bg-[#ffffff] font-semibold text-black"
                  : "bg-[#2a2a2a] text-[#c8c8c8] hover:text-white"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="capfree-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {recentItems.length > 0 && (
          <section className="mb-3">
            <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#8a8a8a]">
              Recently Used
            </h3>
            <ul className="flex flex-col gap-1.5">
              {recentItems.map((item) => (
                <TrackRow
                  key={`recent:${item.id}`}
                  item={item}
                  playing={playing === item.id}
                  adding={adding === item.id}
                  onToggle={() => togglePreview(item)}
                  onAdd={() => void add(item)}
                />
              ))}
            </ul>
          </section>
        )}

        <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#8a8a8a]">
          {tab}
        </h3>
        {items.length === 0 ? (
          <p className="px-1 py-6 text-center text-[12px] text-[#8a8a8a]">
            {tab === "My Audio"
              ? "Upload or record audio and it shows up here."
              : "No sounds match that search."}
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {items.map((item) => (
              <TrackRow
                key={item.id}
                item={item}
                playing={playing === item.id}
                adding={adding === item.id}
                onToggle={() => togglePreview(item)}
                onAdd={() => void add(item)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
