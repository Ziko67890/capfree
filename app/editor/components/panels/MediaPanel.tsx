"use client";

import type { AssetActivationPayload } from "@elah/editor";
import { SourcePanel } from "@elah/editor";

interface MediaPanelProps {
  onAssetActivate: (payload: AssetActivationPayload) => void;
}

/**
 * SourcePanel owns the ingest surface: drop zone, + Add, + URL, grid/list,
 * search, live per-kind counts, thumbnails and durations. It draws its own
 * empty state, so this wrapper adds only the heading.
 */
export function MediaPanel({ onAssetActivate }: MediaPanelProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <h2 className="shrink-0 px-3 pb-2 pt-3 text-[13px] font-semibold text-white">Media</h2>
      <SourcePanel
        defaultLane="media"
        className="capfree-source min-h-0 flex-1"
        activateOnTap
        onAssetActivate={onAssetActivate}
      />
    </div>
  );
}
