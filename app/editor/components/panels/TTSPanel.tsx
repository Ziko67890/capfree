"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw, Plus } from "lucide-react";
import { playbackStore, useTimelineEngine } from "@elah/editor";
import { requestSpeech } from "../../api";
import { addAudioBlob } from "../../placeMedia";
import { Spinner } from "../chrome";
import { useToast } from "../toast";

type VoiceId = "nova" | "onyx" | "shimmer" | "echo";

/**
 * The four voices, each pointing at a real ElevenLabs premade voice.
 *
 * The names on the cards are CapFree's own; `apiVoice` is what actually goes
 * to the API, which speaks in ElevenLabs voice ids and nothing else. Changing
 * which voice a card maps to is a one-line edit here -- the ids below are the
 * long-standing public premade voices, so swap them for your own if you have
 * cloned any.
 */
const VOICES: { id: VoiceId; name: string; detail: string; apiVoice: string }[] = [
  { id: "nova", name: "Nova", detail: "Female · Calm", apiVoice: "21m00Tcm4TlvDq8ikWAM" },
  { id: "onyx", name: "Onyx", detail: "Male · Deep", apiVoice: "pNInz6obpgDQGcFmaJgB" },
  { id: "shimmer", name: "Shimmer", detail: "Female · Bright", apiVoice: "EXAVITQu4vr4xnSDxMaL" },
  { id: "echo", name: "Echo", detail: "Male · Warm", apiVoice: "ErXwobaYiN019PkySvjV" },
];

const MAX_CHARS = 500;
/** Fixed heights, so the bars do not reshuffle on every render. */
const BARS = Array.from({ length: 30 }, (_, i) => 30 + Math.round(55 * Math.abs(Math.sin(i * 1.7))));

const SECTION_LABEL = "mb-1.5 block text-[11px] uppercase tracking-widest text-[#55555f]";

function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Speech from typed text, dropped on the timeline as an audio clip.
 *
 * The synthesis is the API's; what lives here is the text, the voice, the two
 * shaping controls and a small player, so a take can be heard before it is
 * committed to the timeline. Nothing is placed until "Add to timeline" is
 * pressed -- a voice you have not listened to is rarely the one you want.
 */
export function TTSPanel() {
  const engine = useTimelineEngine();
  const toast = useToast();

  const [text, setText] = useState("");
  const [selectedVoice, setSelectedVoice] = useState<VoiceId>("nova");
  const [speed, setSpeed] = useState(1);
  const [pitch, setPitch] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  const audioRef = useRef<HTMLAudioElement>(null);
  // Kept in a ref as well so the cleanup revokes the URL being replaced
  // rather than whatever state happens to hold at unmount.
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  const trimmed = text.trim();
  const overLimit = text.length > MAX_CHARS;
  const canGenerate = trimmed.length > 0 && !overLimit && !generating;

  function replaceAudio(blob: Blob | null) {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    const url = blob ? URL.createObjectURL(blob) : null;
    urlRef.current = url;
    setAudioUrl(url);
    setAudioBlob(blob);
    setPlaying(false);
    setProgress(0);
    setDuration(0);
  }

  async function generate() {
    if (!canGenerate) return;
    setGenerating(true);
    try {
      const voice = VOICES.find((v) => v.id === selectedVoice) ?? VOICES[0];
      const blob = await requestSpeech({
        text: trimmed,
        voiceId: voice.apiVoice,
        speed,
        pitch,
      });
      replaceAudio(blob);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not generate that voice.", "error");
    } finally {
      setGenerating(false);
    }
  }

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  }

  async function addToTimeline() {
    if (!audioBlob) return;
    const name = `TTS — ${trimmed.slice(0, 30)}`;
    try {
      const clipId = await addAudioBlob(
        engine,
        audioBlob,
        name,
        playbackStore.getState().currentFrame,
      );
      if (!clipId) {
        toast("There was no room at the playhead for that clip.", "error");
        return;
      }
      toast("Voice added to timeline");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not place that clip.", "error");
    }
  }

  const played = duration > 0 ? progress / duration : 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="capfree-scroll flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3">
        {/* 1 — the script */}
        <section>
          <span className={SECTION_LABEL}>Your text</span>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Type or paste what you want spoken…"
            aria-label="Text to speak"
            className="min-h-[90px] w-full resize-none rounded-[8px] border border-[var(--border)] bg-[var(--bg-panel2)] px-2.5 py-2 text-[12px] leading-snug text-white outline-none transition-colors placeholder:text-[#555568] focus:border-[var(--accent)]"
          />
          <p className="mt-1 text-right text-[10.5px] text-[var(--text-muted)]">
            <span className={overLimit ? "text-[#ef4444]" : "text-[var(--accent)]"}>
              {text.length}
            </span>{" "}
            / {MAX_CHARS} chars
          </p>
        </section>

        {/* 2 — who says it */}
        <section>
          <span className={SECTION_LABEL}>Voice</span>
          <div className="grid grid-cols-2 gap-2">
            {VOICES.map((voice) => {
              const active = selectedVoice === voice.id;
              return (
                <button
                  key={voice.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSelectedVoice(voice.id)}
                  className={`cursor-pointer rounded-[8px] border p-2.5 text-left transition-colors ${
                    active
                      ? "border-[rgba(91,94,244,0.4)] bg-[rgba(91,94,244,0.15)]"
                      : "border-[var(--border)] bg-[var(--bg-panel2)] hover:border-[#44444c]"
                  }`}
                >
                  <span
                    className={`block text-[12px] font-medium ${active ? "text-[#9b9ef8]" : "text-white"}`}
                  >
                    {voice.name}
                  </span>
                  <span
                    className={`block text-[10.5px] ${
                      active ? "text-[rgba(155,158,248,0.75)]" : "text-[var(--text-muted)]"
                    }`}
                  >
                    {voice.detail}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* 3 — how it is said */}
        <section>
          <span className={SECTION_LABEL}>Adjust</span>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <label htmlFor="tts-speed" className="w-14 shrink-0 text-[11px] text-[var(--text-muted)]">
                Speed
              </label>
              <input
                id="tts-speed"
                type="range"
                min={0.5}
                max={2}
                step={0.1}
                value={speed}
                onChange={(event) => setSpeed(Number(event.target.value))}
                className="h-1 flex-1 accent-[var(--accent)]"
              />
              <span className="w-10 shrink-0 text-right font-mono text-[11px] text-white">
                {speed.toFixed(1)}×
              </span>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="tts-pitch" className="w-14 shrink-0 text-[11px] text-[var(--text-muted)]">
                Pitch
              </label>
              <input
                id="tts-pitch"
                type="range"
                min={-5}
                max={5}
                step={1}
                value={pitch}
                onChange={(event) => setPitch(Number(event.target.value))}
                className="h-1 flex-1 accent-[var(--accent)]"
              />
              <span className="w-10 shrink-0 text-right font-mono text-[11px] text-white">
                {pitch > 0 ? `+${pitch}` : pitch}
              </span>
            </div>
          </div>
        </section>

        {/* 4 — hear it before committing to it */}
        {audioUrl && (
          <section className="rounded-[8px] border border-[var(--border)] bg-[var(--bg-panel2)] p-2.5">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={togglePlay}
                aria-label={playing ? "Pause preview" : "Play preview"}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-white transition-opacity hover:opacity-85"
              >
                {playing ? (
                  <Pause className="h-3.5 w-3.5" fill="currentColor" />
                ) : (
                  <Play className="h-3.5 w-3.5 translate-x-px" fill="currentColor" />
                )}
              </button>

              {/* Bars rather than a real waveform: the shape is decorative,
                  but how much of it is lit is not -- that is the position. */}
              <div className="flex h-7 flex-1 items-center gap-[2px]" aria-hidden>
                {BARS.map((height, index) => (
                  <span
                    key={index}
                    className={`flex-1 rounded-[1px] transition-colors ${
                      index / BARS.length <= played ? "bg-[var(--accent)]" : "bg-[#3a3a42]"
                    }`}
                    style={{ height: `${height}%` }}
                  />
                ))}
              </div>

              <span className="w-9 shrink-0 text-right font-mono text-[11px] text-[var(--text-muted)]">
                {clock(duration - progress)}
              </span>
            </div>

            <audio
              ref={audioRef}
              src={audioUrl}
              className="hidden"
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => {
                setPlaying(false);
                setProgress(0);
              }}
              onTimeUpdate={(event) => setProgress(event.currentTarget.currentTime)}
              onLoadedMetadata={(event) => {
                const value = event.currentTarget.duration;
                setDuration(Number.isFinite(value) ? value : 0);
              }}
            />
          </section>
        )}
      </div>

      {/* 5 — what to do with it */}
      <div className="shrink-0 border-t border-[var(--border)] p-3">
        {audioUrl ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void generate()}
              disabled={!canGenerate}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-[8px] border border-[var(--border)] bg-[var(--bg-panel2)] py-2 text-[12px] text-[var(--text-muted)] transition-colors hover:text-white disabled:opacity-40"
            >
              {generating ? <Spinner /> : <RotateCcw className="h-3.5 w-3.5" />}
              Regenerate
            </button>
            <button
              type="button"
              onClick={() => void addToTimeline()}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-[8px] bg-[#34c77b] py-2 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" />
              Add to timeline
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void generate()}
            disabled={!canGenerate}
            className="flex w-full items-center justify-center gap-2 rounded-[8px] bg-[var(--accent)] py-2 text-[12px] font-semibold text-white transition-colors hover:bg-[#4c4fe0] disabled:opacity-40"
          >
            {generating && <Spinner />}
            {generating ? "Generating…" : "Generate voice"}
          </button>
        )}
        <p className="mt-1.5 text-center text-[10.5px] text-[var(--text-muted)]">
          {overLimit
            ? `${text.length - MAX_CHARS} characters over the limit`
            : "Drops as an audio clip at the playhead"}
        </p>
      </div>
    </div>
  );
}
