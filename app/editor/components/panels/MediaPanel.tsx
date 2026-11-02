"use client";

import type { AssetActivationPayload } from "@elah/editor";
import { SourcePanel, useMediaLibrary } from "@elah/editor";

interface MediaPanelProps {
  onAssetActivate: (payload: AssetActivationPayload) => void;
}

export function MediaPanel({ onAssetActivate }: MediaPanelProps) {
  const library = useMediaLibrary();
  const empty = library.assets.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <h2 className="shrink-0 px-3 pb-2 pt-3 text-[13px] font-semibold text-white">Media</h2>
      {empty && (
        <p className="mx-3 mb-2 rounded-md border border-dashed border-[#3a3a42] bg-[#1a1a1e] px-3 py-6 text-center text-[12px] text-[#888899]">
          Drop files here or click Add
        </p>
      )}
      <SourcePanel
        defaultLane="media"
        className="capfree-source min-h-0 flex-1"
        activateOnTap
        onAssetActivate={onAssetActivate}
      />
    </div>
  );
}
