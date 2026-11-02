"use client";

import type { ReactNode } from "react";
import type { AssetActivationPayload } from "@elah/editor";
import type { EditorTab } from "./ToolBar";
import { ToastDock } from "./toast";
import { AIToolsPanel } from "./AIToolsPanel";
import { AdjustmentPanel } from "./panels/AdjustmentPanel";
import { AudioPanel } from "./panels/AudioPanel";
import { AvatarPanel } from "./panels/AvatarPanel";
import { CaptionsPanel } from "./panels/CaptionsPanel";
import { EffectsPanel } from "./panels/EffectsPanel";
import { FillerFixPanel } from "./panels/FillerFixPanel";
import { FiltersPanel } from "./panels/FiltersPanel";
import { HighlightsPanel } from "./panels/HighlightsPanel";
import { MediaPanel } from "./panels/MediaPanel";
import { ReframePanel } from "./panels/ReframePanel";
import { StickersPanel } from "./panels/StickersPanel";
import { TemplatesPanel } from "./panels/TemplatesPanel";
import { TextPanel } from "./panels/TextPanel";
import { TranscriptPanel } from "./panels/TranscriptPanel";
import { TransitionsPanel } from "./panels/TransitionsPanel";
import { TranslatePanel } from "./panels/TranslatePanel";
import { VocalSplitPanel } from "./panels/VocalSplitPanel";

interface LeftPanelProps {
  tab: EditorTab;
  fps: number;
  onAssetActivate: (payload: AssetActivationPayload) => void;
}

function Pane({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <div className={active ? "flex h-full min-h-0 flex-col" : "hidden"} hidden={!active}>
      {children}
    </div>
  );
}

/** Panels stay mounted so searches, transcripts, and slider values survive tab changes. */
export function LeftPanel({ tab, fps, onAssetActivate }: LeftPanelProps) {
  return (
    <aside className="relative w-[280px] shrink-0 overflow-hidden border-r border-[#2a2a30] bg-[#111114]">
      <Pane active={tab === "media"}><MediaPanel onAssetActivate={onAssetActivate} /></Pane>
      <Pane active={tab === "audio"}><AudioPanel /></Pane>
      <Pane active={tab === "text"}><TextPanel fps={fps} /></Pane>
      <Pane active={tab === "stickers"}><StickersPanel fps={fps} /></Pane>
      <Pane active={tab === "effects"}><EffectsPanel /></Pane>
      <Pane active={tab === "transitions"}><TransitionsPanel fps={fps} /></Pane>
      <Pane active={tab === "captions"}><CaptionsPanel fps={fps} /></Pane>
      <Pane active={tab === "filters"}><FiltersPanel /></Pane>
      <Pane active={tab === "adjustment"}><AdjustmentPanel fps={fps} /></Pane>
      <Pane active={tab === "templates"}><TemplatesPanel fps={fps} /></Pane>
      <Pane active={tab === "avatar"}><AvatarPanel fps={fps} /></Pane>
      <Pane active={tab === "transcript"}><TranscriptPanel fps={fps} active={tab === "transcript"} /></Pane>
      <Pane active={tab === "fillers"}><FillerFixPanel fps={fps} /></Pane>
      <Pane active={tab === "vocals"}><VocalSplitPanel fps={fps} /></Pane>
      <Pane active={tab === "reframe"}><ReframePanel active={tab === "reframe"} /></Pane>
      <Pane active={tab === "highlights"}><HighlightsPanel fps={fps} /></Pane>
      <Pane active={tab === "translate"}><TranslatePanel fps={fps} /></Pane>
      <Pane active={tab === "aitools"}><AIToolsPanel fps={fps} /></Pane>
      <ToastDock />
    </aside>
  );
}
