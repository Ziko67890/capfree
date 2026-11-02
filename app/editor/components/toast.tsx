"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type Tone = "ok" | "error";

interface ToastItem {
  id: number;
  tone: Tone;
  text: string;
}

interface ToastApi {
  push: (text: string, tone?: Tone) => void;
  items: ToastItem[];
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((text: string, tone: Tone = "ok") => {
    const id = Date.now() + Math.random();
    setItems((current) => [...current.slice(-3), { id, tone, text }]);
    window.setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id));
    }, 3400);
  }, []);

  const value = useMemo(() => ({ push, items }), [items, push]);
  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast(): (text: string, tone?: Tone) => void {
  const api = useContext(ToastContext);
  if (!api) throw new Error("Toasts are only available inside the editor");
  return api.push;
}

/** Sits at the bottom of the left panel: teal for success, red for errors. */
export function ToastDock() {
  const api = useContext(ToastContext);
  if (!api || api.items.length === 0) return null;
  return (
    <div className="pointer-events-none absolute inset-x-2 bottom-2 z-30 flex flex-col gap-1">
      {api.items.map((item) => (
        <p
          key={item.id}
          role={item.tone === "error" ? "alert" : "status"}
          className={`rounded-md px-2 py-1.5 text-[11px] leading-snug shadow-lg ${
            item.tone === "error" ? "bg-red-600 text-white" : "bg-[#00d4b4] text-black"
          }`}
        >
          {item.text}
        </p>
      ))}
    </div>
  );
}
