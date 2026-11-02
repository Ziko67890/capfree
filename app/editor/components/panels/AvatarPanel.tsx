"use client";

import { useState } from "react";
import { PORTRAITS } from "../../visuals";
import { PanelBody } from "../chrome";

const VOICES = ["Aria", "Nova", "Reed", "Sage"];

const AVATARS = [
  { id: "a1", name: "Maya" },
  { id: "a2", name: "Leon" },
  { id: "a3", name: "Priya" },
  { id: "a4", name: "Noah" },
  { id: "a5", name: "Sofia" },
  { id: "a6", name: "Kai" },
  { id: "a7", name: "Elena" },
  { id: "a8", name: "Omar" },
];

export function AvatarPanel({ fps: _fps }: { fps: number }) {
  const [picked, setPicked] = useState("a1");
  const [voice, setVoice] = useState(VOICES[0]);
  const [script, setScript] = useState("Hi, welcome to my channel.");

  return (
    <PanelBody>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-1.5">
          {AVATARS.map((avatar, index) => (
            <button
              key={avatar.id}
              type="button"
              onClick={() => setPicked(avatar.id)}
              className={`rounded-md bg-[#1e1e24] p-1 ${picked === avatar.id ? "ring-2 ring-[#00d4b4]" : ""}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={PORTRAITS[index]} alt={avatar.name} className="w-full rounded object-cover" style={{ aspectRatio: "3 / 4" }} />
              <span className="mt-1 block text-[10px] text-white">{avatar.name}</span>
            </button>
          ))}
        </div>
        <label className="text-[11px] text-[#888899]">
          Script
          <textarea
            value={script}
            onChange={(event) => setScript(event.target.value)}
            rows={4}
            className="mt-1 w-full rounded-md border border-[#2a2a30] bg-[#1a1a1e] p-2 text-[12px] text-white outline-none"
          />
        </label>
        <div className="flex flex-wrap gap-1">
          {VOICES.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setVoice(item)}
              className={`rounded-full px-2 py-1 text-[11px] ${voice === item ? "bg-[#00d4b4] text-black" : "bg-[#2a2a30] text-white"}`}
            >
              {item}
            </button>
          ))}
        </div>
        <button type="button" disabled className="h-9 rounded-md bg-[#2a2a30] text-[12px] font-semibold text-[#888899]">
          Generate
        </button>
        <p className="text-center text-[11px] text-[#888899]">API later</p>
      </div>
    </PanelBody>
  );
}
