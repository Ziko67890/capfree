"use client";

import { useState } from "react";
import type { AssetActivationPayload } from "@elah/editor";
import { SourcePanel } from "@elah/editor";
import { SubTabs } from "../chrome";
import { StockPanel } from "./StockPanel";

interface MediaPanelProps {
  onAssetActivate: (payload: AssetActivationPayload) => void;
}

const TABS = ["Library", "Stock"] as const;

/**
 * Two sources of footage under one tab. SourcePanel owns the ingest surface:
 * drop zone, + Add, + URL, grid/list, search, live per-kind counts, thumbnails
 * and durations. It draws its own empty state, so this wrapper adds only the
 * heading and the switch.
 *
 * Both stay mounted: SourcePanel holds in-progress imports, and hiding it keeps
 * a tab change from interrupting them.
 */
export function MediaPanel({ onAssetActivate }: MediaPanelProps) {
  const [tab, setTab] = useState<string>("Library");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <h2 className="shrink-0 px-3 pb-1 pt-3 text-[13px] font-semibold text-white">Media</h2>
      <div className="shrink-0">
        <SubTabs tabs={TABS} value={tab} onChange={setTab} />
      </div>
      <div className={tab === "Library" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
        <SourcePanel
          defaultLane="media"
          className="capfree-source min-h-0 flex-1"
          activateOnTap
          onAssetActivate={onAssetActivate}
        />
      </div>
      <div className={tab === "Stock" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
        <StockPanel />
      </div>
    </div>
  );
}
