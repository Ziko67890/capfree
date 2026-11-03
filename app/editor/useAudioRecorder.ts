"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type RecorderState = "unsupported" | "idle" | "recording" | "saving";

export interface AudioRecorder {
  state: RecorderState;
  /** Elapsed seconds while recording. */
  seconds: number;
  error: string | null;
  start: () => void;
  stop: () => void;
}

function supported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

/**
 * Microphone capture through MediaRecorder. The caller receives the finished
 * blob and decides where it lands; this hook only owns the device, the
 * recorder and the elapsed clock, and releases the microphone on every exit
 * path including unmount.
 */
export function useAudioRecorder(onCapture: (blob: Blob) => Promise<void>): AudioRecorder {
  const [state, setState] = useState<RecorderState>(() => (supported() ? "idle" : "unsupported"));
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef(0);
  // Kept in a ref so a new callback identity each render cannot stale the stop
  // handler registered when recording began. Written in an effect, because
  // touching a ref during render is not allowed.
  const onCaptureRef = useRef(onCapture);
  useEffect(() => {
    onCaptureRef.current = onCapture;
  }, [onCapture]);

  const release = useCallback(() => {
    window.clearInterval(timerRef.current);
    timerRef.current = 0;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  useEffect(() => release, [release]);

  const start = useCallback(() => {
    if (!supported()) {
      setState("unsupported");
      return;
    }
    setError(null);
    setSeconds(0);

    void navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        streamRef.current = stream;
        chunksRef.current = [];
        const recorder = new MediaRecorder(stream);
        recorderRef.current = recorder;

        recorder.addEventListener("dataavailable", (event) => {
          if (event.data.size > 0) chunksRef.current.push(event.data);
        });

        recorder.addEventListener("stop", () => {
          const type = recorder.mimeType || "audio/webm";
          const blob = new Blob(chunksRef.current, { type });
          chunksRef.current = [];
          release();

          if (blob.size === 0) {
            setError("That recording came back empty.");
            setState("idle");
            return;
          }

          setState("saving");
          void onCaptureRef
            .current(blob)
            .catch((failure: unknown) => {
              setError(failure instanceof Error ? failure.message : "Could not save that recording.");
            })
            .finally(() => setState("idle"));
        });

        recorder.start();
        setState("recording");
        timerRef.current = window.setInterval(() => setSeconds((value) => value + 1), 1000);
      })
      .catch((failure: unknown) => {
        release();
        setState("idle");
        setError(
          failure instanceof Error && failure.name === "NotAllowedError"
            ? "Microphone access was blocked."
            : "No microphone was available.",
        );
      });
  }, [release]);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    else {
      release();
      setState("idle");
    }
  }, [release]);

  return { state, seconds, error, start, stop };
}
