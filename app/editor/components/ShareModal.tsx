"use client";

import { useEffect, useRef, useState } from "react";
// lucide-react v1 carries no brand marks, so these are neutral stand-ins
// rather than the platforms' own logos -- which would need their brand
// assets and their permission anyway.
import { X, MonitorPlay, Music2, Clapperboard, ExternalLink, Check } from "lucide-react";
import {
  fetchAuthStatus,
  oauthStartUrl,
  uploadToPlatform,
  type AuthStatus,
  type SocialPlatform,
} from "../api";
import { Spinner } from "./chrome";
import { useToast } from "./toast";

export interface ShareTarget {
  /** Absolute path the API can read, as the export reported it. */
  filePath: string;
  filename: string;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  bytes: number;
}

interface ShareModalProps {
  target: ShareTarget;
  onClose: () => void;
}

type Phase = "idle" | "uploading" | "done";

const PLATFORMS: {
  id: SocialPlatform;
  name: string;
  Icon: typeof MonitorPlay;
  /** What this platform calls the text field. */
  captionLabel: string;
}[] = [
  { id: "youtube", name: "YouTube", Icon: MonitorPlay, captionLabel: "Title" },
  { id: "tiktok", name: "TikTok", Icon: Music2, captionLabel: "Caption" },
  { id: "instagram", name: "Instagram Reels", Icon: Clapperboard, captionLabel: "Caption" },
];

const SCHEDULES = ["Post now", "In 1 hour", "Tomorrow 9am", "Custom"] as const;
type Schedule = (typeof SCHEDULES)[number];

const GB = 1024 * 1024 * 1024;

const NOTHING_CONNECTED: AuthStatus = {
  connected: { youtube: false, tiktok: false, instagram: false },
  configured: { youtube: false, tiktok: false, instagram: false },
  accounts: { youtube: "", tiktok: "", instagram: "" },
};

/**
 * The connection status, with an unreachable API treated as "nothing is
 * connected" rather than as a failure: the dialog still works, every platform
 * reads as unconnected, and the Connect buttons explain themselves.
 */
async function loadStatus(): Promise<AuthStatus> {
  try {
    return await fetchAuthStatus();
  } catch {
    return NOTHING_CONNECTED;
  }
}

/**
 * What each platform will refuse, checked before anything is sent.
 *
 * These are warnings rather than blocks: the limits move, and an export that
 * is merely the wrong shape still uploads -- it just will not look right. The
 * one thing worth stopping for is a file the platform will certainly reject,
 * and the person can see that here instead of after the upload.
 */
function warningsFor(platform: SocialPlatform, target: ShareTarget): string[] {
  const notes: string[] = [];
  const { width, height, bytes, durationSeconds } = target;
  const landscape = width !== null && height !== null && width > height;

  if (platform === "tiktok") {
    if (landscape) notes.push("TikTok prefers vertical (9:16)");
    if (bytes > 4 * GB) notes.push("File too large (max 4GB)");
    if (durationSeconds !== null && durationSeconds > 600) notes.push("Video too long (max 10 min)");
  }
  if (platform === "instagram") {
    if (landscape) notes.push("Reels prefers vertical (9:16)");
    if (bytes > 1 * GB) notes.push("File too large (max 1GB)");
    if (durationSeconds !== null && durationSeconds > 900) notes.push("Video too long (max 15 min)");
  }
  return notes;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "—";
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Hashtags as typed, normalised to the "#one #two" every platform accepts. */
function normaliseTags(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((tag) => tag.replace(/^#+/, "").trim())
    .filter(Boolean)
    .slice(0, 30);
}

export function ShareModal({ target, onClose }: ShareModalProps) {
  const toast = useToast();
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [selected, setSelected] = useState<Set<SocialPlatform>>(new Set());
  const [caption, setCaption] = useState(target.filename.replace(/\.[^.]+$/, ""));
  const [hashtags, setHashtags] = useState("");
  const [schedule, setSchedule] = useState<Schedule>("Post now");
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [results, setResults] = useState<Record<string, string>>({});
  const [connecting, setConnecting] = useState<SocialPlatform | null>(null);

  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      const next = await loadStatus();
      if (live) setStatus(next);
    })();
    return () => {
      live = false;
      if (pollRef.current !== null) window.clearInterval(pollRef.current);
    };
  }, []);

  /*
    Connecting happens in the browser, not in here: the OAuth page will not
    load in an embedded frame, and should not -- the person needs to see the
    address bar they are typing their password into. So the tab is opened and
    this polls until the API says the token landed, which is the only signal
    that crosses back.
  */
  function connect(platform: SocialPlatform) {
    window.open(oauthStartUrl(platform), "_blank", "noopener,noreferrer");
    setConnecting(platform);

    const started = Date.now();
    if (pollRef.current !== null) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(async () => {
      const next = await loadStatus();
      {
        setStatus(next);
        if (next.connected[platform]) {
          window.clearInterval(pollRef.current!);
          pollRef.current = null;
          setConnecting(null);
          setSelected((past) => new Set(past).add(platform));
          toast(`${platform} connected.`);
          return;
        }
      }
      if (Date.now() - started > 60_000) {
        window.clearInterval(pollRef.current!);
        pollRef.current = null;
        setConnecting(null);
        toast("Gave up waiting for that sign-in. Try again when the tab is done.", "error");
      }
    }, 2000);
  }

  function toggle(platform: SocialPlatform) {
    setSelected((past) => {
      const next = new Set(past);
      if (next.has(platform)) next.delete(platform);
      else next.add(platform);
      return next;
    });
  }

  async function upload() {
    const chosen = PLATFORMS.filter((p) => selected.has(p.id));
    if (chosen.length === 0) return;

    setPhase("uploading");
    setProgress(Object.fromEntries(chosen.map((p) => [p.id, 5])));
    setResults({});

    const tags = normaliseTags(hashtags);
    const body = (platform: SocialPlatform) => {
      const text = [caption, tags.map((t) => `#${t}`).join(" ")].filter(Boolean).join("\n\n");
      if (platform === "youtube") {
        return { file_path: target.filePath, title: caption, description: text, tags };
      }
      return { file_path: target.filePath, caption: text };
    };

    /*
      One at a time, not in parallel. These are large files going out of one
      connection, and a failure in the middle should leave the ones already
      posted alone rather than being tangled up with them.
    */
    const finished: Record<string, string> = {};
    for (const platform of chosen) {
      // Without progress events from the API this is a two-step indication:
      // started, then finished. Better an honest coarse bar than a fake
      // smooth one.
      setProgress((past) => ({ ...past, [platform.id]: 35 }));
      try {
        const result = await uploadToPlatform(platform.id, body(platform.id));
        setProgress((past) => ({ ...past, [platform.id]: 100 }));
        finished[platform.id] = result.url || result.status || "Posted";
      } catch (err) {
        setProgress((past) => ({ ...past, [platform.id]: 0 }));
        finished[platform.id] = `Failed — ${err instanceof Error ? err.message : "unknown error"}`;
      }
      setResults({ ...finished });
    }

    setPhase("done");
    const failures = Object.values(finished).filter((v) => v.startsWith("Failed")).length;
    if (failures === 0) {
      toast("All uploads complete.");
      window.setTimeout(onClose, 2000);
    } else {
      toast(`${failures} of ${chosen.length} uploads failed.`, "error");
    }
  }

  const count = selected.size;
  const busy = phase === "uploading";
  const allDone = phase === "done" && Object.values(results).every((v) => !v.startsWith("Failed"));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-[560px] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-panel)] shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between px-5 pb-3 pt-4">
          <h2 className="text-[15px] font-semibold">
            <span className="text-white">Share to Social</span>
            <span className="text-[var(--text-muted)]"> — </span>
            <span className="text-[var(--accent)]">CapFree</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--bg-panel2)] text-[var(--text-muted)] transition-colors hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pb-4">
          {/* The file being shared */}
          <div className="rounded-lg bg-[var(--bg-panel2)] p-3">
            <p className="truncate text-[13px] font-semibold text-white">{target.filename}</p>
            <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
              {target.width && target.height ? `${target.width}×${target.height}` : "—"} ·{" "}
              {formatDuration(target.durationSeconds)} · {formatBytes(target.bytes)}
            </p>
          </div>

          {/* Platforms */}
          <section className="flex flex-col gap-2">
            {PLATFORMS.map(({ id, name, Icon }) => {
              const isConnected = status?.connected[id] ?? false;
              const isConfigured = status?.configured[id] ?? false;
              const account = status?.accounts[id] ?? "";
              const notes = warningsFor(id, target);
              const picked = selected.has(id);
              return (
                <div
                  key={id}
                  className={`rounded-lg border p-3 transition-colors ${
                    picked
                      ? "border-[var(--accent)] bg-[rgba(91,94,244,0.08)]"
                      : "border-[var(--border)] bg-[var(--bg-panel2)]"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={picked}
                      disabled={!isConnected || busy}
                      onChange={() => toggle(id)}
                      aria-label={`Share to ${name}`}
                      className="h-4 w-4 shrink-0 accent-[var(--accent)] disabled:opacity-40"
                    />
                    <Icon className="h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium text-white">{name}</span>
                      <span className="block text-[11px]">
                        {isConnected ? (
                          <span className="text-[#22c55e]">
                            ● Connected{account ? ` · ${account}` : ""}
                          </span>
                        ) : isConfigured ? (
                          <span className="text-[var(--text-muted)]">Not connected</span>
                        ) : (
                          <span className="text-[#f59e0b]">No API credentials set</span>
                        )}
                      </span>
                    </span>

                    {!isConnected && (
                      <button
                        type="button"
                        onClick={() => connect(id)}
                        disabled={!isConfigured || connecting !== null || busy}
                        className="flex shrink-0 items-center gap-1.5 rounded-md border border-[#f59e0b] px-2.5 py-1 text-[12px] font-medium text-[#f59e0b] transition-colors hover:bg-[rgba(245,158,11,0.12)] disabled:opacity-40"
                      >
                        {connecting === id ? (
                          <>
                            <Spinner />
                            Waiting…
                          </>
                        ) : (
                          <>
                            <ExternalLink className="h-3 w-3" />
                            Connect
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {picked && notes.length > 0 && (
                    <ul className="mt-2 flex flex-col gap-0.5 pl-7">
                      {notes.map((note) => (
                        <li key={note} className="text-[11px] text-[#f59e0b]">
                          ⚠ {note}
                        </li>
                      ))}
                    </ul>
                  )}

                  {(busy || phase === "done") && picked && (
                    <div className="mt-2 pl-7">
                      <div className="h-[3px] w-full overflow-hidden rounded-full bg-[var(--bg-panel2)]">
                        <div
                          className={`h-full rounded-full transition-[width] duration-300 ${
                            results[id]?.startsWith("Failed") ? "bg-[#ef4444]" : "bg-[var(--accent)]"
                          }`}
                          style={{ width: `${progress[id] ?? 0}%` }}
                        />
                      </div>
                      {results[id] && (
                        <p
                          className={`mt-1 break-all text-[11px] ${
                            results[id].startsWith("Failed")
                              ? "text-[#ef4444]"
                              : "text-[var(--text-muted)]"
                          }`}
                        >
                          {results[id]}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </section>

          {/* Post details */}
          <section className="flex flex-col gap-3">
            <div>
              <label htmlFor="share-caption" className="mb-1 block text-[11px] text-[var(--text-muted)]">
                Title / Caption
              </label>
              <textarea
                id="share-caption"
                value={caption}
                rows={2}
                disabled={busy}
                onChange={(event) => setCaption(event.target.value)}
                className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--bg-panel2)] px-3 py-2 text-[13px] text-white outline-none transition-colors focus:border-[var(--accent)] disabled:opacity-50"
              />
            </div>
            <div>
              <label htmlFor="share-tags" className="mb-1 block text-[11px] text-[var(--text-muted)]">
                Hashtags
              </label>
              <input
                id="share-tags"
                value={hashtags}
                disabled={busy}
                placeholder="editing capcut tutorial"
                onChange={(event) => setHashtags(event.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-panel2)] px-3 py-2 text-[13px] text-white outline-none transition-colors placeholder:text-[#555568] focus:border-[var(--accent)] disabled:opacity-50"
              />
            </div>
            <div>
              <span className="mb-1 block text-[11px] text-[var(--text-muted)]">Schedule</span>
              <div className="flex flex-wrap gap-2">
                {SCHEDULES.map((option) => (
                  <button
                    key={option}
                    type="button"
                    disabled={busy}
                    aria-pressed={schedule === option}
                    onClick={() => setSchedule(option)}
                    className={`rounded-full border px-3 py-1 text-[12px] transition-colors disabled:opacity-40 ${
                      schedule === option
                        ? "border-[var(--accent)] bg-[rgba(91,94,244,0.18)] text-white"
                        : "border-[var(--border)] bg-[var(--bg-panel2)] text-[#888896] hover:border-[#44444c]"
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
              {schedule !== "Post now" && (
                <p className="mt-1.5 text-[11px] text-[#f59e0b]">
                  ⚠ Scheduling is not wired up yet — this will post immediately.
                </p>
              )}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--border)] px-5 py-3.5">
          <span className="text-[11px] text-[var(--text-muted)]">
            {allDone
              ? "✓ All uploads complete!"
              : `${count} platform${count === 1 ? "" : "s"} selected`}
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-lg border border-[var(--border)] px-3.5 py-2 text-[13px] text-[var(--text-muted)] transition-colors hover:text-white disabled:opacity-40"
            >
              {phase === "done" ? "Close" : "Cancel"}
            </button>
            <button
              type="button"
              onClick={() => void upload()}
              disabled={count === 0 || busy || allDone}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                allDone ? "bg-[#1f9a52]" : "bg-[var(--accent)] hover:bg-[#4c4fe0]"
              }`}
            >
              {allDone ? (
                <>
                  <Check className="h-4 w-4" />
                  Done
                </>
              ) : busy ? (
                <>
                  <Spinner />
                  Uploading…
                </>
              ) : (
                "Upload"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
