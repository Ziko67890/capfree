"use client";

import { useEffect, useRef, useState } from "react";
import type { AssetActivationPayload } from "@elah/editor";
import { SourcePanel, useMediaLibrary } from "@elah/editor";
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
  const library = useMediaLibrary();
  const libraryRef = useRef<HTMLDivElement>(null);
  const lastCount = useRef(library.assets.length);

  // Reveal whatever was just imported. The store appends to `order`, so the new
  // asset is the last row; SourcePanel sets no per-asset attribute to target,
  // and its own list element owns the scrollbar, so this finds that element and
  // moves it. Only grows -- removing an asset should not yank the view.
  useEffect(() => {
    const count = library.assets.length;
    if (count <= lastCount.current) {
      lastCount.current = count;
      return;
    }
    lastCount.current = count;

    const scroller = libraryRef.current?.querySelector<HTMLElement>(".overflow-auto");
    if (!scroller) return;
    // Next frame: the new row has to be laid out before it can be scrolled to.
    const frame = window.requestAnimationFrame(() => {
      scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [library.assets.length]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <h2 className="shrink-0 px-3 pb-1 pt-3 text-[13px] font-semibold text-white">Media</h2>
      <div className="shrink-0">
        <SubTabs tabs={TABS} value={tab} onChange={setTab} />
      </div>
      <div
        ref={libraryRef}
        // overflow-hidden bounds the box so SourcePanel's own overflow-auto
        // list has a height to scroll within rather than growing the panel.
        className={
          tab === "Library" ? "capfree-scroll flex min-h-0 flex-1 flex-col overflow-hidden" : "hidden"
        }
      >
        <SourcePanel
          defaultLane="media"
          className="capfree-source min-h-0 flex-1"
          // min-h-0: that element is `flex-1 overflow-auto` with no
          // min-height, and in a flex column that makes it grow to fit its
          // content instead of scrolling.
          //
          // The rest is shape only, in globals.css under .capfree-media-*,
          // because SourcePanel draws this surface itself.
          classNames={{
            dropzone: "min-h-0 capfree-media-drop",
            thumb: "capfree-media-thumb",
            cardTitle: "capfree-media-title",
          }}
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
