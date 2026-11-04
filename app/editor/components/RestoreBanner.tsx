"use client";

import { RotateCcw, X } from "lucide-react";
import { describeAge, type AutoSave } from "../autosave";

export function RestoreBanner({
  save,
  onRestore,
  onDiscard,
}: {
  save: AutoSave;
  onRestore: () => void;
  onDiscard: () => void;
}) {
  return (
    <div
      role="status"
      className="flex shrink-0 items-center gap-3 border-b border-[#ffffff]/40 bg-[#1e1e24] px-4 py-2"
    >
      <RotateCcw className="h-4 w-4 shrink-0 text-[#ffffff]" aria-hidden />
      <p className="min-w-0 flex-1 text-[12px] text-white">
        Restore unsaved session?
        <span className="ml-2 text-[11px] text-[#888899]">
          {save.clips} clip{save.clips === 1 ? "" : "s"}, saved {describeAge(save.savedAt)}
        </span>
      </p>
      <button
        type="button"
        onClick={onRestore}
        className="h-7 shrink-0 rounded-md bg-[#ffffff] px-3 text-[12px] font-semibold text-black transition-colors duration-150 hover:bg-[#e6e6e6]"
      >
        Restore
      </button>
      <button
        type="button"
        onClick={onDiscard}
        className="flex h-7 shrink-0 items-center gap-1 rounded-md border border-[#2a2a30] bg-[#1a1a1e] px-3 text-[12px] text-white transition-colors duration-150 hover:border-[#ffffff]"
      >
        <X className="h-3 w-3" aria-hidden />
        Discard
      </button>
    </div>
  );
}
