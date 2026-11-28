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
  AudioLines,
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
  | "tts"
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
  { id: "tts", label: "Voiceover", icon: AudioLines, exclusive: true },
  { id: "aitools", label: "AI Tools", icon: Wand2, exclusive: true },
];

interface ToolBarProps {
  tab: EditorTab;
  onTab: (tab: EditorTab) => void;
}

export function ToolBar({ tab, onTab }: ToolBarProps) {
  return (
    <div className="capfree-scroll flex h-14 shrink-0 items-stretch gap-1 overflow-x-auto border-b border-[var(--border)] bg-[var(--bg-app)] px-2">
      {TABS.map((item) => {
        const Icon = item.icon;
        const active = tab === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onTab(item.id)}
            className={`relative flex w-[72px] shrink-0 flex-col items-center justify-center gap-1 border-b-2 px-1 transition-colors duration-150 ${
              active
                ? "border-[var(--accent)] text-white"
                : "border-transparent text-[var(--text-muted)] hover:text-white"
            }`}
          >
            <Icon className="h-[18px] w-[18px]" />
            <span className="text-[11px] leading-none">{item.label}</span>
            {/*
              The premium tabs used to carry a "✦ Exclusive" pill, which no
              longer fits in 56px and put its words into the button's
              accessible name. A dot in the accent keeps the signal at a
              glance; the title says what it means for anyone hovering.
            */}
            {item.exclusive && (
              <span
                aria-hidden
                title="Exclusive"
                className="absolute right-2 top-1.5 h-1.5 w-1.5 rounded-full bg-[var(--accent)]"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
