"use client";

import { useState } from "react";

export interface ApiJob {
  /** Id of the task currently in flight, or null when idle. */
  busy: string | null;
  error: string | null;
  /** Runs one task at a time and funnels its failure into `error`. */
  run: (id: string, task: () => Promise<void>) => void;
  clearError: () => void;
}

/**
 * Shared plumbing for the panels that call the Python API: one job at a time,
 * errors surfaced as text rather than thrown into the render tree.
 */
export function useApiJob(): ApiJob {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run(id: string, task: () => Promise<void>) {
    if (busy) return;
    setBusy(id);
    setError(null);
    void task()
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Something went wrong");
      })
      .finally(() => setBusy(null));
  }

  return { busy, error, run, clearError: () => setError(null) };
}

/** mm:ss.d for caption and filler timestamps. */
export function stamp(seconds: number): string {
  const safe = Math.max(0, seconds);
  const mins = Math.floor(safe / 60);
  const secs = safe - mins * 60;
  return `${mins}:${secs.toFixed(1).padStart(4, "0")}`;
}
