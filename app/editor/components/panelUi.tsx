"use client";

import type { ReactNode } from "react";

/** Shared input shape: full width, 36px tall. */
export const fieldClass =
  "h-9 w-full rounded-md border border-[#3a3a40] bg-[#1a1a1e] px-2.5 text-[12px] text-white outline-none focus:border-[#ffffff]";

export function PanelFrame({
  title,
  search,
  children,
}: {
  title: string;
  search?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-col gap-2 px-3 pb-2 pt-3">
        <h2 className="text-[13px] font-semibold text-white">{title}</h2>
        {search}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">{children}</div>
    </div>
  );
}

export function PanelSearch({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className={fieldClass}
      aria-label={placeholder}
    />
  );
}

export function PanelAlert({ children }: { children: string }) {
  return (
    <p role="alert" className="mt-2 text-[11px] leading-snug text-red-400">
      {children}
    </p>
  );
}

export function PresetButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-[76px] flex-col items-center justify-center gap-1 rounded-md border border-[#3a3a40] bg-[#1a1a1e] px-1 text-[11px] text-white hover:border-[#ffffff]"
    >
      {children}
      <span className="max-w-full truncate">{label}</span>
    </button>
  );
}
