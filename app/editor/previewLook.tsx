"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Look {
  filterCss: string;
  adjustCss: string;
  effectCss: string;
  vignette: number;
  reframe: CropRect | null;
  activeFilter: string | null;
  activeEffect: string | null;
  setFilter: (name: string | null, css: string) => void;
  setEffect: (name: string | null, css: string) => void;
  setAdjust: (css: string, vignette: number) => void;
  setReframe: (rect: CropRect | null) => void;
}

const LookContext = createContext<Look | null>(null);

export function PreviewLookProvider({ children }: { children: ReactNode }) {
  const [filterCss, setFilterCss] = useState("");
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [effectCss, setEffectCss] = useState("");
  const [activeEffect, setActiveEffect] = useState<string | null>(null);
  const [adjustCss, setAdjustCss] = useState("");
  const [vignette, setVignette] = useState(0);
  const [reframe, setReframe] = useState<CropRect | null>(null);

  const value = useMemo<Look>(
    () => ({
      filterCss,
      adjustCss,
      effectCss,
      vignette,
      reframe,
      activeFilter,
      activeEffect,
      setFilter: (name, css) => {
        setActiveFilter(name);
        setFilterCss(css);
      },
      setEffect: (name, css) => {
        setActiveEffect(name);
        setEffectCss(css);
      },
      setAdjust: (css, amount) => {
        setAdjustCss(css);
        setVignette(amount);
      },
      setReframe,
    }),
    [activeEffect, activeFilter, adjustCss, effectCss, filterCss, reframe, vignette],
  );

  return <LookContext.Provider value={value}>{children}</LookContext.Provider>;
}

export function usePreviewLook(): Look {
  const look = useContext(LookContext);
  if (!look) throw new Error("Preview look is only available inside the editor");
  return look;
}

export function cropForAspect(ratio: string): CropRect {
  const [w, h] = ratio.split(":").map(Number);
  const target = w / h;
  const stage = 16 / 9;
  if (target < stage) {
    const width = target / stage;
    return { x: (1 - width) / 2, y: 0, width, height: 1 };
  }
  const height = stage / target;
  return { x: 0, y: (1 - height) / 2, width: 1, height };
}
