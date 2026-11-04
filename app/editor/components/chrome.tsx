"use client";

import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

export function Spinner() {
  return <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />;
}

export function SearchField({
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
      className="h-8 w-full rounded-md border border-[#2a2a30] bg-[#1a1a1e] px-2 text-[12px] text-white outline-none transition-colors duration-150 placeholder:text-[#888899] focus:border-[#ffffff]"
    />
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  busy,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className="flex h-9 w-full items-center justify-center gap-2 rounded-md bg-[#ffffff] text-[12px] font-semibold text-black transition-colors duration-150 hover:bg-[#e6e6e6] disabled:opacity-50"
    >
      {busy && <Spinner />}
      {children}
    </button>
  );
}

export function QuietButton({
  children,
  onClick,
  disabled,
  tone = "default",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "default" | "danger";
}) {
  const color =
    tone === "danger"
      ? "border-red-900 bg-red-700 text-white hover:bg-red-600"
      : "border-[#2a2a30] bg-[#2a2a30] text-white hover:border-[#ffffff]";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-8 w-full items-center justify-center gap-2 rounded-md border text-[12px] transition-colors duration-150 disabled:opacity-50 ${color}`}
    >
      {children}
    </button>
  );
}

export function TealSwitch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-2 rounded-md px-1 py-1 text-left text-[12px] text-white transition-colors duration-150 disabled:opacity-50"
    >
      <span>{label}</span>
      <span className={`h-5 w-9 shrink-0 rounded-full p-0.5 transition-colors duration-150 ${checked ? "bg-[#ffffff]" : "bg-[#3a3a42]"}`}>
        <span className={`block h-4 w-4 rounded-full bg-white transition-transform duration-150 ${checked ? "translate-x-4" : ""}`} />
      </span>
    </button>
  );
}

export function SubTabs({
  tabs,
  value,
  onChange,
}: {
  tabs: readonly string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto px-2 pt-2">
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => onChange(tab)}
          className={`shrink-0 rounded-full px-2 py-1 text-[11px] transition-colors duration-150 ${
            tab === value ? "bg-[#2a2a30] text-white" : "text-[#888899] hover:text-white"
          }`}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

export function CategoryLayout({
  categories,
  category,
  onCategory,
  search,
  header,
  children,
}: {
  categories: readonly string[];
  category: string;
  onCategory: (category: string) => void;
  search?: ReactNode;
  header?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-[#111114]">
      {header}
      {search && <div className="shrink-0 px-2 pb-1 pt-2">{search}</div>}
      <div className="flex min-h-0 flex-1">
        <nav className="capfree-scroll h-full w-[104px] shrink-0 overflow-y-auto border-r border-[#2a2a30] py-1">
          {categories.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onCategory(item)}
              className={`w-full px-2 py-1.5 text-left text-[11px] leading-tight transition-colors duration-150 ${
                item === category ? "bg-[#2a2a30] text-white" : "text-[#888899] hover:bg-[#2a2a30] hover:text-white"
              }`}
            >
              {item}
            </button>
          ))}
        </nav>
        <div className="capfree-scroll min-h-0 flex-1 overflow-y-auto p-2">{children}</div>
      </div>
    </div>
  );
}

export function EmptyNote({ text = "No content" }: { text?: string }) {
  return <p className="px-1 py-6 text-center text-[12px] text-[#888899]">{text}</p>;
}

export function PanelBody({ children }: { children: ReactNode }) {
  return <div className="capfree-scroll h-full overflow-y-auto bg-[#111114] p-2">{children}</div>;
}

export function PreviewBanner() {
  return (
    <p className="mb-2 rounded-md bg-[#1e1e24] px-2 py-1.5 text-[11px] leading-snug text-[#c8c8ce]">
      Preview UI — backend not wired
    </p>
  );
}

export function SkeletonGrid({
  count,
  columns = 4,
  ratio = "1 / 1",
}: {
  count: number;
  columns?: 2 | 4;
  ratio?: string;
}) {
  return (
    <div className={columns === 2 ? "grid grid-cols-2 gap-1.5" : "grid grid-cols-4 gap-1.5"}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="animate-pulse rounded-md bg-[#2a2a30]" style={{ aspectRatio: ratio }} />
      ))}
    </div>
  );
}

export function ErrorNote({ text }: { text: string }) {
  return (
    <p role="alert" className="mb-2 rounded-md bg-red-950 px-2 py-1.5 text-[11px] leading-snug text-red-300">
      {text}
    </p>
  );
}

export function HintNote({ children }: { children: ReactNode }) {
  return <p className="mb-2 text-[11px] leading-snug text-[#888899]">{children}</p>;
}
