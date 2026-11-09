"use client";

import Link from "next/link";
import { Scissors, Download, Settings, Undo2, Redo2 } from "lucide-react";

interface TopBarProps {
  onExport: () => void;
  onSettings: () => void;
}

export function TopBar({ onExport, onSettings }: TopBarProps) {
  return (
    <header className="flex items-center h-12 px-4 border-b border-[#222] bg-[#111113] flex-shrink-0 gap-4">
      {/* Logo */}
      <Link href="/" className="flex items-center gap-1.5 flex-shrink-0">
        <div className="w-7 h-7 rounded-md bg-[#ffffff] flex items-center justify-center">
          <Scissors className="w-4 h-4 text-black" />
        </div>
        <span className="text-sm font-bold tracking-tight text-white hidden sm:inline">CapFree</span>
      </Link>

      {/* Project name */}
      <div className="flex-1 min-w-0 flex items-center justify-center">
        <span className="text-sm text-[#888] truncate">Untitled Project</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          aria-label="Undo"
          className="w-8 h-8 flex items-center justify-center rounded-md text-[#888] hover:text-white hover:bg-[#222] transition-colors"
        >
          <Undo2 className="w-4 h-4" />
        </button>
        <button
          aria-label="Redo"
          className="w-8 h-8 flex items-center justify-center rounded-md text-[#888] hover:text-white hover:bg-[#222] transition-colors"
        >
          <Redo2 className="w-4 h-4" />
        </button>

        <button
          onClick={onSettings}
          aria-label="Settings"
          className="w-8 h-8 flex items-center justify-center rounded-md text-[#888] hover:text-white hover:bg-[#222] transition-colors"
        >
          <Settings className="w-4 h-4" />
        </button>

        <button
          onClick={onExport}
          className="flex items-center gap-1.5 px-3 h-8 rounded-md bg-[#ffffff] text-black text-sm font-semibold hover:bg-[#e6e6e6] transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Export
        </button>
      </div>
    </header>
  );
}
