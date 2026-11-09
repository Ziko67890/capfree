"use client";

import { Sparkles, X } from "lucide-react";

interface SettingsModalProps {
  onClose: () => void;
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        className="w-full max-w-[460px] overflow-hidden rounded-lg border border-[#2a2a30] bg-[#141418]"
      >
        <header className="flex items-center justify-between border-b border-[#2a2a30] px-4 py-3">
          <h2 className="text-[14px] font-semibold text-white">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="grid h-7 w-7 place-items-center rounded-md text-[#888899] transition-colors hover:bg-[#2a2a30] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="p-4">
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-[#888899]">AI</h3>

          {/* No key field: the model key lives on the server, so there is
              nothing here for the user to configure. */}
          <div className="mt-2 flex items-start gap-2 rounded-md bg-[#1a1a1e] px-2 py-2">
            <Sparkles className="mt-px h-3.5 w-3.5 shrink-0 text-[#c8c8ce]" aria-hidden />
            <p className="text-[11px] leading-snug text-[#c8c8ce]">
              <span className="text-white">No setup needed.</span> The prompt bar below the
              preview runs on CapFree&apos;s own server, so there is no API key to enter. Free
              accounts get <span className="text-white">5 AI edits a day</span>, and the counter
              resets at midnight UTC.
            </p>
          </div>

          <p className="mt-3 text-[11px] leading-snug text-[#888899]">
            Try &ldquo;remove all silences&rdquo;, &ldquo;add chill music&rdquo;, or &ldquo;make it
            30 seconds&rdquo;.
          </p>
        </div>
      </div>
    </div>
  );
}
