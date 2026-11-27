"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

/** A stretch of the timeline, in seconds from its start. */
export interface TimeRange {
  start: number;
  end: number;
}

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
  grain: number;
  reframe: CropRect | null;
  activeFilter: string | null;
  activeEffect: string | null;
  /** A CSS transform for the stage -- the Ken Burns push, when one is on. */
  motionCss: string;
  activeMotion: string | null;
  /**
   * Stretches the editor has been told are silent, drawn on the scrub bar.
   * A marking, not a cut: nothing on the timeline changes because of it.
   */
  silences: TimeRange[];
  setFilter: (name: string | null, css: string) => void;
  setEffect: (name: string | null, css: string) => void;
  setAdjust: (css: string, vignette: number, grain?: number) => void;
  setReframe: (rect: CropRect | null) => void;
  setMotion: (name: string | null, css: string) => void;
  setSilences: (ranges: TimeRange[]) => void;
}

const LookContext = createContext<Look | null>(null);

export function PreviewLookProvider({ children }: { children: ReactNode }) {
  const [filterCss, setFilterCss] = useState("");
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [effectCss, setEffectCss] = useState("");
  const [activeEffect, setActiveEffect] = useState<string | null>(null);
  const [adjustCss, setAdjustCss] = useState("");
  const [vignette, setVignette] = useState(0);
  const [grain, setGrain] = useState(0);
  const [reframe, setReframe] = useState<CropRect | null>(null);
  const [motionCss, setMotionCss] = useState("");
  const [activeMotion, setActiveMotion] = useState<string | null>(null);
  const [silences, setSilences] = useState<TimeRange[]>([]);

  const value = useMemo<Look>(
    () => ({
      filterCss,
      adjustCss,
      effectCss,
      vignette,
      grain,
      reframe,
      activeFilter,
      activeEffect,
      motionCss,
      activeMotion,
      silences,
      setFilter: (name, css) => {
        setActiveFilter(name);
        setFilterCss(css);
      },
      setEffect: (name, css) => {
        setActiveEffect(name);
        setEffectCss(css);
      },
      setAdjust: (css, amount, noise = 0) => {
        setAdjustCss(css);
        setVignette(amount);
        setGrain(noise);
      },
      setReframe,
      setMotion: (name, css) => {
        setActiveMotion(name);
        setMotionCss(css);
      },
      setSilences,
    }),
    [
      activeEffect,
      activeFilter,
      activeMotion,
      adjustCss,
      effectCss,
      filterCss,
      grain,
      motionCss,
      reframe,
      silences,
      vignette,
    ],
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
