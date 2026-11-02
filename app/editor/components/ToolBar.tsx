"use client";

import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight,
  Captions,
  Crop,
  FileText,
  Film,
  Globe,
  LayoutTemplate,
  Mic,
  Music,
  Palette,
  Scissors,
  SlidersHorizontal,
  Sparkles,
  Star,
  Sticker,
  Type,
  UserRound,
  Wand2,
} from "lucide-react";

export type EditorTab =
  | "media"
  | "audio"
  | "text"
  | "stickers"
  | "effects"
  | "transitions"
  | "captions"
  | "filters"
  | "adjustment"
  | "templates"
  | "avatar"
  | "transcript"
  | "fillers"
  | "vocals"
  | "reframe"
  | "highlights"
  | "translate"
  | "aitools";

const TABS: Array<{ id: EditorTab; label: string; icon: LucideIcon; exclusive?: boolean }> = [
  { id: "media", label: "Media", icon: Film },
  { id: "audio", label: "Audio", icon: Music },
  { id: "text", label: "Text", icon: Type },
  { id: "stickers", label: "Stickers", icon: Sticker },
  { id: "effects", label: "Effects", icon: Sparkles },
  { id: "transitions", label: "Transitions", icon: ArrowLeftRight },
  { id: "captions", label: "Captions", icon: Captions },
  { id: "filters", label: "Filters", icon: Palette },
  { id: "adjustment", label: "Adjustment", icon: SlidersHorizontal },
  { id: "templates", label: "Templates", icon: LayoutTemplate },
  { id: "avatar", label: "AI Avatar", icon: UserRound },
  { id: "transcript", label: "Transcript", icon: FileText, exclusive: true },
  { id: "fillers", label: "Filler Fix", icon: Scissors, exclusive: true },
  { id: "vocals", label: "Vocal Split", icon: Mic, exclusive: true },
  { id: "reframe", label: "Reframe", icon: Crop, exclusive: true },
  { id: "highlights", label: "Highlights", icon: Star, exclusive: true },
  { id: "translate", label: "Translate", icon: Globe, exclusive: true },
  { id: "aitools", label: "AI Tools", icon: Wand2, exclusive: true },
];

interface ToolBarProps {
  tab: EditorTab;
  onTab: (tab: EditorTab) => void;
}

export function ToolBar({ tab, onTab }: ToolBarProps) {
  return (
    <div className="capfree-scroll flex h-[76px] shrink-0 items-stretch overflow-x-auto border-b border-[#2a2a30] bg-[#111114]">
      {TABS.map((item) => {
        const Icon = item.icon;
        const active = tab === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onTab(item.id)}
            className={`flex w-[88px] shrink-0 flex-col items-center justify-center gap-0.5 border-b-2 px-1 transition-colors duration-150 ${
              active ? "border-[#00d4b4] text-white" : "border-transparent text-[#aaaaaa] hover:text-white"
            }`}
          >
            <Icon className="h-4 w-4" />
            <span className="text-[11px] leading-none">{item.label}</span>
            {item.exclusive ? (
              <span className="mt-0.5 rounded-[6px] bg-[#00d4b4] px-1.5 py-px text-[8px] font-semibold leading-none text-black">
                ✦ Exclusive
              </span>
            ) : (
              <span className="mt-0.5 h-[12px]" aria-hidden />
            )}
          </button>
        );
      })}
    </div>
  );
}
