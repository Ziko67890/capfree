"use client";

import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight,
  Bot,
  Captions,
  Crop,
  Disc3,
  FileText,
  Film,
  Globe,
  LayoutTemplate,
  Mic,
  Music,
  Palette,
  Scissors,
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
  | "music"
  | "ai"
  | "text"
  | "stickers"
  | "effects"
  | "transitions"
  | "captions"
  | "filters"
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
  { id: "ai", label: "AI", icon: Bot },
  { id: "audio", label: "Audio", icon: Music },
  { id: "music", label: "Music", icon: Disc3 },
  { id: "text", label: "Text", icon: Type },
  { id: "stickers", label: "Stickers", icon: Sticker },
  { id: "effects", label: "Effects", icon: Sparkles },
  { id: "transitions", label: "Transitions", icon: ArrowLeftRight },
  { id: "captions", label: "Captions", icon: Captions },
  { id: "filters", label: "Filters", icon: Palette },
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
    <div className="capfree-scroll flex h-[76px] shrink-0 items-stretch gap-2 overflow-x-auto border-b border-[#2a2a30] bg-[#111114] px-2">
      {TABS.map((item) => {
        const Icon = item.icon;
        const active = tab === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onTab(item.id)}
            className={`flex w-[80px] shrink-0 flex-col items-center justify-center gap-1 border-b-2 px-1 transition-colors duration-150 ${
              active ? "border-[#ffffff] text-white" : "border-transparent text-[#8f8f97] hover:text-white"
            }`}
          >
            <Icon className="h-[18px] w-[18px]" />
            <span className="text-[11px] leading-none">{item.label}</span>
            {item.exclusive ? (
              <span className="mt-0.5 rounded-[6px] bg-[#ffffff] px-1.5 py-px text-[8px] font-semibold leading-none text-black">
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
