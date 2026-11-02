"use client";

import { useState } from "react";
import { useTimelineEngine } from "@elah/editor";
import { transitionTarget } from "../../clipEdit";
import { TRANSITION_FROM, TRANSITION_LOOKS, TRANSITION_TO, type TransitionLook } from "../../visuals";
import { PanelBody, SearchField } from "../chrome";
import { useToast } from "../toast";

interface TransitionsPanelProps {
  fps: number;
}

export function TransitionsPanel({ fps }: TransitionsPanelProps) {
  const engine = useTimelineEngine();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState("Dissolve");

  const cards = TRANSITION_LOOKS.filter((item) => item.name.toLowerCase().includes(query.trim().toLowerCase()));

  function addLook(look: TransitionLook) {
    const pair = transitionTarget(engine);
    if ("error" in pair) {
      toast(pair.error, "error");
      return;
    }
    const created = engine.addTransition({
      fromClipId: pair.from.id,
      toClipId: pair.to.id,
      trackId: pair.trackId,
      kind: look.kind,
      durationFrames: Math.max(2, Math.round(fps * (look.name === "Cut" ? 0.05 : 0.6))),
      easing: "ease-out",
      direction: look.direction ?? "left",
    });
    if (!created) toast("Could not add that transition.", "error");
    else toast(`${look.name} added`);
  }

  function applyToAll() {
    const look = TRANSITION_LOOKS.find((item) => item.name === picked) ?? TRANSITION_LOOKS[1];
    const project = engine.getProject();
    let count = 0;
    engine.batch(() => {
      for (const track of project.tracks) {
        const clips = [...(project.clips[track.id] ?? [])].sort((a, b) => a.startFrame - b.startFrame);
        for (let i = 0; i < clips.length - 1; i += 1) {
          const created = engine.addTransition({
            fromClipId: clips[i].id,
            toClipId: clips[i + 1].id,
            trackId: track.id,
            kind: look.kind,
            durationFrames: Math.max(2, Math.round(fps * 0.6)),
            easing: "ease-out",
            direction: look.direction ?? "left",
          });
          if (created) count += 1;
        }
      }
    });
    if (count === 0) toast("Add at least two clips on a track first.", "error");
    else toast(`Applied ${look.name} to ${count} cuts`);
  }

  return (
    <PanelBody>
      <button
        type="button"
        onClick={applyToAll}
        className="mb-2 h-8 w-full rounded-md bg-[#2a2a30] text-[12px] text-white transition-colors duration-150 hover:border hover:border-[#00d4b4]"
      >
        Apply to All
      </button>
      <div className="mb-2">
        <SearchField value={query} onChange={setQuery} placeholder="Search transitions" />
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {cards.map((card) => (
          <button
            key={card.name}
            type="button"
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData("text/plain", card.name);
              event.dataTransfer.effectAllowed = "copy";
            }}
            onClick={() => {
              setPicked(card.name);
              addLook(card);
            }}
            className={`group capfree-tr-stage relative overflow-hidden rounded-md bg-black text-left ${card.cls} ${
              picked === card.name ? "ring-2 ring-[#00d4b4]" : "hover:ring-1 hover:ring-[#00d4b4]"
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
            <span className="absolute right-1 top-1 rounded bg-black/70 px-1 text-[9px] text-white">{card.duration}</span>
            <span className="absolute inset-x-0 bottom-0 bg-black/60 px-1 py-1 text-[10px] text-white">{card.name}</span>
          </button>
        ))}
      </div>
    </PanelBody>
  );
}
