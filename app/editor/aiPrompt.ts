"use client";

import { ApiError, requestAiPrompt } from "./api";

export type PromptAction =
  | { kind: "remove_silences" }
  | { kind: "add_music"; mood: string }
  | { kind: "trim_to_duration"; seconds: number }
  | { kind: "reply"; text: string };

export interface TimelineContext {
  durationSeconds: number;
  clipCount: number;
}

export interface PromptResolution {
  action: PromptAction;
  /** Free prompts left today, as the API counted them. */
  remaining: number;
}

/**
 * Asks the API to turn a sentence into one editor action.
 *
 * The model, the key and the daily limit all live server-side; this only has to
 * narrow the response onto the actions the editor can run.
 */
export async function resolvePrompt(
  prompt: string,
  context: TimelineContext,
  signal?: AbortSignal,
): Promise<PromptResolution> {
  const data = await requestAiPrompt(
    {
      prompt,
      duration: context.durationSeconds,
      clip_count: context.clipCount,
    },
    signal,
  );

  const remaining = typeof data.remaining === "number" ? data.remaining : 0;

  if (data.action === "remove_silences") {
    return { action: { kind: "remove_silences" }, remaining };
  }
  if (data.action === "add_music" && typeof data.mood === "string" && data.mood.trim()) {
    return { action: { kind: "add_music", mood: data.mood.trim() }, remaining };
  }
  if (data.action === "trim_to_duration") {
    const seconds = Number(data.seconds);
    if (Number.isFinite(seconds) && seconds > 0) {
      return { action: { kind: "trim_to_duration", seconds }, remaining };
    }
  }
  if (data.action === "reply" && typeof data.text === "string" && data.text.trim()) {
    return { action: { kind: "reply", text: data.text.trim() }, remaining };
  }

  // A shape we do not recognise is a bug on one side or the other, not an edit.
  throw new ApiError("The AI service sent back something unexpected.");
}
