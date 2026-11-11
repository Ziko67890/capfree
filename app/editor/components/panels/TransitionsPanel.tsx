"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useTimelineEngine } from "@elah/editor";
import { selectClip } from "../../clipEdit";
import { useSelectedClip } from "../../useSelectedClip";
import { useTransitionGaps, type TransitionGap } from "../../useTransitionGaps";
import { TRANSITION_FROM, TRANSITION_LOOKS, TRANSITION_TO, type TransitionLook } from "../../visuals";
import { EmptyNote, HintNote, PanelBody, QuietButton, SearchField } from "../chrome";
import { useToast } from "../toast";

interface TransitionsPanelProps {
  fps: number;
}

const MIN_SECONDS = 0.2;
const MAX_SECONDS = 2;
const DEFAULT_SECONDS = 0.5;
/** The engine rounds every transition to an even span, so two frames is the floor. */
const MIN_FRAMES = 2;

function clampSeconds(value: number): number {
  return Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, value));
}

function gapLabel(gap: TransitionGap): string {
  return `${gap.from.name} → ${gap.to.name}`;
}

export function TransitionsPanel({ fps }: TransitionsPanelProps) {
  const engine = useTimelineEngine();
  const toast = useToast();
  const gaps = useTransitionGaps();
  const selected = useSelectedClip();

  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState("Dissolve");
  const [seconds, setSeconds] = useState(DEFAULT_SECONDS);

  // The cut that opens at the selected clip. Clicking a row in the list below
  // selects that clip, so the selection stays the one source of truth.
  const target = selected
    ? (gaps.find(
        (gap) => gap.trackId === selected.trackId && gap.from.id === selected.clip.id,
      ) ?? null)
    : null;
  const live = target?.transitions[0] ?? null;
  const bridged = gaps.filter((gap) => gap.transitions.length > 0).length;
  const manyTracks = new Set(gaps.map((gap) => gap.trackId)).size > 1;
  const cards = TRANSITION_LOOKS.filter((item) =>
    item.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  function framesFor(look: TransitionLook): number {
    if (look.instant) return MIN_FRAMES;
    return Math.max(MIN_FRAMES, Math.round(seconds * fps));
  }

  /** Takes everything off a cut. Call inside a batch. */
  function clearGap(gap: TransitionGap) {
    for (const item of gap.transitions) engine.removeTransition(item.id);
  }

  function apply(look: TransitionLook) {
    setPicked(look.name);
    if (!target) {
      toast(
        gaps.length === 0
          ? "Put a second clip on the track first."
          : "Select a clip that has one after it, or pick a cut below.",
        "error",
      );
      return;
    }

    let added = false;
    engine.batch(() => {
      // addTransition appends without checking, so the old one goes first.
      clearGap(target);
      added =
        engine.addTransition({
          fromClipId: target.from.id,
          toClipId: target.to.id,
          trackId: target.trackId,
          kind: look.kind,
          durationFrames: framesFor(look),
          easing: "ease-out",
          direction: look.direction ?? "left",
        }) !== null;
    }, `${look.name} transition`);

    if (added) toast(`${look.name} on ${gapLabel(target)}`);
    else toast("Could not add that transition.", "error");
  }

  function removeFromTarget() {
    if (!target || target.transitions.length === 0) {
      toast("That cut has no transition.", "error");
      return;
    }
    const gone = target.transitions.length;
    engine.batch(() => {
      clearGap(target);
    }, "Remove transition");
    toast(gone === 1 ? "Transition removed" : `Removed ${gone} transitions`);
  }

  /** Resizes what is already on the target cut, once the drag settles. */
  function commitDuration() {
    if (!live) return;
    engine.updateTransition(live.id, {
      durationFrames: Math.max(MIN_FRAMES, Math.round(seconds * fps)),
      // Without an explicit offset the engine pins startFrame and grows the
      // transition to one side; zero re-centres it on the cut.
      offsetFrames: 0,
    });
  }

  function pickGap(gap: TransitionGap) {
    selectClip(gap.from.id);
    const existing = gap.transitions[0];
    if (existing) setSeconds(clampSeconds(existing.durationFrames / fps));
  }

  function applyToAll() {
    if (gaps.length === 0) {
      toast("Add at least two clips on a track first.", "error");
      return;
    }
    const look = TRANSITION_LOOKS.find((item) => item.name === picked) ?? TRANSITION_LOOKS[0];
    const frames = framesFor(look);
    let count = 0;
    engine.batch(() => {
      for (const gap of gaps) {
        clearGap(gap);
        const created = engine.addTransition({
          fromClipId: gap.from.id,
          toClipId: gap.to.id,
          trackId: gap.trackId,
          kind: look.kind,
          durationFrames: frames,
          easing: "ease-out",
          direction: look.direction ?? "left",
        });
        if (created) count += 1;
      }
    }, `${look.name} on every cut`);

    if (count === 0) toast("Could not add those transitions.", "error");
    else toast(`Applied ${look.name} to ${count} cut${count === 1 ? "" : "s"}`);
  }

  return (
    <PanelBody>
      <label className="mb-2 flex flex-col gap-1 text-[11px] text-[#c8c8ce]">
        <span className="flex items-center justify-between">
          Duration
          <span className="font-mono text-[#888899]">{seconds.toFixed(2)}s</span>
        </span>
        <input
          type="range"
          min={MIN_SECONDS}
          max={MAX_SECONDS}
          step={0.05}
          value={seconds}
          aria-label="Transition duration in seconds"
          onChange={(event) => setSeconds(Number(event.target.value))}
          onPointerUp={commitDuration}
          onKeyUp={commitDuration}
          className="w-full accent-[#ffffff]"
        />
      </label>

      <div className="mb-2">
        <SearchField value={query} onChange={setQuery} placeholder="Search transitions" />
      </div>

      {target ? (
        <p className="mb-2 truncate rounded-md bg-[#1e1e24] px-2 py-1.5 text-[11px]">
          <span className="text-white">{gapLabel(target)}</span>
          {live ? (
            <span className="text-[#ffffff]">
              {` · ${live.kind} ${(live.durationFrames / fps).toFixed(2)}s`}
            </span>
          ) : (
            <span className="text-[#888899]">{" · no transition yet"}</span>
          )}
        </p>
      ) : (
        <HintNote>
          Select a clip that has another clip after it, or pick a cut below, then choose a
          transition.
        </HintNote>
      )}

      <p className="mb-1 flex items-center justify-between text-[11px] text-[#888899]">
        <span>Cuts</span>
        {gaps.length > 0 && (
          <span>
            {bridged} of {gaps.length} bridged
          </span>
        )}
      </p>
      {gaps.length === 0 ? (
        <EmptyNote text="No cuts yet — a transition needs two clips meeting on one track." />
      ) : (
        <div className="mb-3 flex flex-col gap-1">
          {gaps.map((gap) => {
            const active = target?.id === gap.id;
            const on = gap.transitions[0];
            const stacked = gap.transitions.length - 1;
            return (
              <button
                key={gap.id}
                type="button"
                onClick={() => pickGap(gap)}
                aria-pressed={active}
                className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors duration-150 ${
                  active
                    ? "border-[#ffffff] bg-[#1e1e24]"
                    : "border-[#2a2a30] bg-[#1a1a1e] hover:border-[#3a3a42]"
                }`}
              >
                <span
                  aria-hidden
                  className={`h-2 w-2 shrink-0 rounded-full ${on ? "bg-[#ffffff]" : "bg-[#3a3a42]"}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] text-white">{gapLabel(gap)}</span>
                  <span className="block truncate text-[10px] text-[#888899]">
                    {manyTracks ? `${gap.trackName} · ` : ""}
                    {on ? `${on.kind} · ${(on.durationFrames / fps).toFixed(2)}s` : "No transition"}
                    {stacked > 0 ? ` · +${stacked} stacked` : ""}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-[9px] text-[#888899]">#{gap.index}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="mb-2">
        <QuietButton onClick={removeFromTarget} disabled={!live} tone="danger">
          Remove transition
        </QuietButton>
      </div>

      {cards.length === 0 ? (
        <EmptyNote text="No transition matches that search." />
      ) : (
        <div className="grid grid-cols-2 gap-1.5">
          {cards.map((card) => (
            <div
              key={card.name}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData("text/plain", card.name);
                event.dataTransfer.effectAllowed = "copy";
              }}
              className={`group capfree-tr-stage relative overflow-hidden rounded-md bg-black text-left ${card.cls} ${
                picked === card.name ? "ring-2 ring-[#ffffff]" : "hover:ring-1 hover:ring-[#ffffff]"
              }`}
              style={{ aspectRatio: "2 / 3" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={TRANSITION_FROM} alt="" className="capfree-tr-from" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={TRANSITION_TO} alt="" className="capfree-tr-to" />
              {card.name === "Shatter" && (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={TRANSITION_FROM} alt="" className="capfree-piece capfree-piece-1" />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={TRANSITION_FROM} alt="" className="capfree-piece capfree-piece-2" />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={TRANSITION_FROM} alt="" className="capfree-piece capfree-piece-3" />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={TRANSITION_FROM} alt="" className="capfree-piece capfree-piece-4" />
                </>
              )}
              <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[9px] text-white">
                {card.instant ? "cut" : `${seconds.toFixed(2)}s`}
              </span>
              <span className="absolute inset-x-0 bottom-0 bg-black/60 px-1 py-1 text-[10px] text-white">
                {card.name}
              </span>

              {/* Covers the card so a click anywhere applies, as before. */}
              <button
                type="button"
                onClick={() => apply(card)}
                aria-label={`Apply ${card.name}`}
                className="absolute inset-0 h-full w-full cursor-pointer"
              />
              {/* Shown on hover or when the covering button has focus. The
                  badge takes no pointer events, so the click lands on it. */}
              <span
                aria-hidden
                className="pointer-events-none absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-[#ffffff] text-black opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
              >
                <Plus className="h-3 w-3" />
              </span>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={applyToAll}
        disabled={gaps.length === 0}
        className="mt-2 h-8 w-full rounded-md bg-[#2a2a30] text-[12px] text-white transition-colors duration-150 hover:border hover:border-[#ffffff] disabled:opacity-50"
      >
        Apply {picked} to every cut
      </button>
    </PanelBody>
  );
}
