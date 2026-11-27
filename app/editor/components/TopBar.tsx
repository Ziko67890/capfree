"use client";

import Link from "next/link";
import { Scissors, Download, Settings, Undo2, Redo2 } from "lucide-react";
import { useTimelineEngine, useTracksStore } from "@elah/editor";

interface TopBarProps {
  onExport: () => void;
  onSettings: () => void;
}

export function TopBar({ onExport, onSettings }: TopBarProps) {
  // Same source as TimelineBar's own undo/redo pair: the engine does the work
  // and the tracks store carries the two flags it syncs on every history
  // change, so the two sets of buttons can never disagree.
  const engine = useTimelineEngine();
  const canUndo = useTracksStore((state) => state.canUndo);
  const canRedo = useTracksStore((state) => state.canRedo);

  const iconButtonClass =
    "w-8 h-8 flex items-center justify-center rounded-md text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-panel2)] transition-colors disabled:pointer-events-none disabled:opacity-40";

  return (
    <header className="flex h-12 flex-shrink-0 items-center gap-4 border-b border-[var(--border)] bg-[var(--bg-app)] px-4">
      {/* Logo — the mark is the icon itself now, not a white tile around it */}
      <Link href="/" className="flex flex-shrink-0 items-center gap-2">
        <Scissors className="h-[18px] w-[18px] text-white" />
        {/* Always shown: the window cannot go below 1024px, so the breakpoint
            this used to hide behind only ever hid the name. */}
        <span className="text-[15px] font-bold tracking-tight">
          <span className="text-white">Cap</span>
          <span className="text-[var(--accent)]">Free</span>
        </span>
      </Link>

      {/* Project name */}
      <div className="flex min-w-0 flex-1 items-center justify-center">
        <span className="truncate text-[13px] text-[var(--text-muted)]">Untitled Project</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          type="button"
          aria-label="Undo"
          title="Undo"
          disabled={!canUndo}
          onClick={() => engine.undo()}
          className={iconButtonClass}
        >
          <Undo2 className="w-4 h-4" />
        </button>
        <button
          type="button"
          aria-label="Redo"
          title="Redo"
          disabled={!canRedo}
          onClick={() => engine.redo()}
          className={iconButtonClass}
        >
          <Redo2 className="w-4 h-4" />
        </button>

        <button onClick={onSettings} aria-label="Settings" className={iconButtonClass}>
          <Settings className="w-4 h-4" />
        </button>

        <button
          onClick={onExport}
          className="ml-1 flex h-8 items-center gap-1.5 rounded-lg bg-white px-3.5 text-[13px] font-semibold text-black transition-colors hover:bg-[#e6e6e6]"
        >
          <Download className="h-3.5 w-3.5" />
          Export
        </button>
      </div>
    </header>
  );
}
