"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { framesToSeconds, useTimelineEngine, useTracks } from "@elah/editor";
import { requestAiEdit, type AiEditOperation } from "../api";
import { applyOperation, OpSkipped, OP_STATUS, type AppliedEdit } from "../aiEditOps";
import { usePreviewLook } from "../previewLook";
import { useSelectedClip } from "../useSelectedClip";
import { useToast } from "./toast";

interface AIPanelProps {
  fps: number;
}

/** One turn in the conversation. */
type Message =
  | { role: "user"; id: string; text: string }
  | { role: "ai"; id: string; text: string; edits: AppliedEdit[]; notes: string[] };

/** The daily allowance. Hardcoded until there is an account to count against. */
const FREE_EDITS_PER_DAY = 5;

/**
 * `label` is what the button says; `prompt` is what goes in the box, which is
 * only spelled out where the two differ -- the endpoint matches on keywords,
 * and "Add outro" alone does not contain any of them.
 */
const QUICK_PROMPTS: { icon: string; label: string; prompt?: string }[] = [
  { icon: "✂️", label: "Remove silences" },
  { icon: "🎵", label: "Add chill music" },
  { icon: "🙏", label: "Add outro", prompt: "add thanks for watching outro" },
  { icon: "🎨", label: "Cinematic color" },
  { icon: "📝", label: "Add hook text" },
  { icon: "🔤", label: "Auto captions" },
];

const TYPE_BADGE: Record<string, { label: string; className: string; thumb: string }> = {
  video: { label: "VIDEO", className: "bg-[rgba(91,94,244,0.15)] text-[#7b7ef8]", thumb: "🎥" },
  image: { label: "IMAGE", className: "bg-[rgba(52,199,123,0.15)] text-[#34c77b]", thumb: "🖼️" },
  audio: { label: "AUDIO", className: "bg-[rgba(245,158,11,0.15)] text-[#f59e0b]", thumb: "🎵" },
  text: { label: "TEXT", className: "bg-[rgba(91,94,244,0.15)] text-[#7b7ef8]", thumb: "🔤" },
};

const DOT_TONE: Record<AppliedEdit["tone"], string> = {
  blue: "bg-[var(--accent)]",
  green: "bg-[#34c77b]",
  orange: "bg-[#f59e0b]",
};

function timecode(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

let messageCounter = 0;
function nextId(): string {
  messageCounter += 1;
  return `msg-${messageCounter}`;
}

/** The three pulsing dots, shown against whatever the panel is doing. */
function Thinking({ status }: { status: string }) {
  return (
    <div className="flex items-center gap-1.5 py-1.5 text-[11.5px] text-[var(--text-muted)]">
      <span className="flex gap-[3px]">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="capfree-ai-dot h-1 w-1 rounded-full bg-[var(--accent)]"
            style={{ animationDelay: `${index * 0.2}s` }}
          />
        ))}
      </span>
      {status}
    </div>
  );
}

/**
 * Natural-language editing, as a conversation.
 *
 * The panel does not decide what a sentence means -- /ai-edit does that, by
 * keyword -- and it does not carry out the edits either; `aiEditOps` does, and
 * hands back an undo for each one. What lives here is the exchange: what was
 * asked, what came back, and which of those edits are still applied.
 *
 * Every applied edit keeps its own undo, so a chip from three messages ago can
 * still be taken back without disturbing anything applied since.
 */
export function AIPanel({ fps }: AIPanelProps) {
  const engine = useTimelineEngine();
  const tracks = useTracks();
  const look = usePreviewLook();
  const selection = useSelectedClip();
  const selected = selection?.clip ?? null;
  const toast = useToast();

  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(FREE_EDITS_PER_DAY);
  const [undone, setUndone] = useState<Set<string>>(new Set());

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const busy = status !== null;

  // With nothing selected the prompt is about the timeline as a whole, which
  // for the API's purposes is a video unless the project is audio only.
  const clipType = selected?.type ?? "video";
  const badge = TYPE_BADGE[clipType] ?? TYPE_BADGE.video;
  const clipSeconds = selected
    ? framesToSeconds(selected.durationFrames, fps)
    : framesToSeconds(tracks.totalFrames, fps);
  // Read off the tracks store rather than the engine, so the strip follows
  // the timeline as clips come and go instead of freezing at mount.
  const clipCount = Object.values(tracks.clips).reduce((total, list) => total + list.length, 0);

  // Keep the newest turn in view, the way a chat does.
  useEffect(() => {
    const scroller = scrollRef.current;
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }, [messages, status]);

  function resize(element: HTMLTextAreaElement) {
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 72)}px`;
  }

  function undoEdit(edit: AppliedEdit) {
    try {
      edit.undo();
      setUndone((past) => new Set(past).add(edit.id));
      toast("Undone.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "That edit could not be undone.", "error");
    }
  }

  async function send(text: string) {
    const ask = text.trim();
    if (!ask || busy) return;
    if (remaining <= 0) {
      toast("No free edits left today.", "error");
      return;
    }

    setMessages((past) => [...past, { role: "user", id: nextId(), text: ask }]);
    setPrompt("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    setStatus("Processing clip…");

    try {
      const answer = await requestAiEdit({
        prompt: ask,
        clip_type: clipType,
        clip_duration: clipSeconds,
        timeline_state: {
          total_frames: tracks.totalFrames,
          fps,
          tracks: engine.getProject().tracks.length,
          clips: Object.values(engine.getProject().clips).reduce(
            (total, list) => total + list.length,
            0,
          ),
          selected_clip_id: selected?.id ?? null,
        },
      });

      // The endpoint recognised nothing. That is an answer, not an error, so
      // it reads as one and costs nothing.
      if (answer.operations.length === 0) {
        setStatus(null);
        setMessages((past) => [
          ...past,
          { role: "ai", id: nextId(), text: answer.description, edits: [], notes: [] },
        ]);
        return;
      }

      const edits: AppliedEdit[] = [];
      const notes: string[] = [];
      for (const operation of answer.operations as AiEditOperation[]) {
        setStatus(OP_STATUS[operation.op] ?? "Working…");
        try {
          edits.push(await applyOperation(operation, { engine, fps, look }));
        } catch (err) {
          // One operation the timeline cannot take does not sink the rest:
          // it is reported beside the ones that did apply.
          if (err instanceof OpSkipped) notes.push(err.message);
          else notes.push(err instanceof Error ? err.message : "That edit failed.");
        }
      }

      setStatus(null);
      setRemaining((left) => Math.max(0, left - 1));
      const applied = edits.length;
      const headline =
        applied === 0
          ? "I could not apply any of that to this timeline."
          : `Done! Applied ${applied} edit${applied === 1 ? "" : "s"} to your clip:`;
      setMessages((past) => [...past, { role: "ai", id: nextId(), text: headline, edits, notes }]);
    } catch (err) {
      setStatus(null);
      const why = err instanceof Error ? err.message : "That prompt did not work.";
      setMessages((past) => [...past, { role: "ai", id: nextId(), text: why, edits: [], notes: [] }]);
      toast(why, "error");
    }
  }

  return (
    // Every pane stays mounted, so the marker is what lets a test — or a
    // future selector — scope a query to this panel rather than the hidden
    // media list behind it.
    <div className="flex h-full min-h-0 flex-col" data-capfree-ai>
      {/* Header */}
      <div className="shrink-0 border-b border-[var(--border)] px-4 pb-2.5 pt-3.5">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-white">
          <Sparkles className="h-4 w-4 text-[var(--accent)]" aria-hidden />
          CapFree AI
          <span className="rounded-full bg-[rgba(91,94,244,0.15)] px-[7px] py-0.5 text-[10px] font-semibold tracking-[0.3px] text-[var(--accent)]">
            BETA
          </span>
        </div>
      </div>

      {/*
        Suggestions as one scrolling line rather than a block at the bottom.
        Six of them stacked two-wide cost ninety vertical pixels that the
        conversation wants more, and a row puts them where the eye already is
        when the panel opens. overflow-x-auto keeps every chip reachable at
        280px without wrapping; the scrollbar itself is hidden because a
        horizontal bar under six pills reads as clutter, and the chips are
        clipped mid-pill at the edge so it is obvious there are more.
      */}
      <div
        className="capfree-chips flex shrink-0 gap-1.5 overflow-x-auto border-b border-[var(--border)] px-3.5 py-2.5"
        // Inline rather than a class: hiding the bar is this row's own
        // business, and a stylesheet rule for it has to survive the build to
        // work -- when it does not, a 16px bar silently eats a third of the
        // row's height. scrollbar-width is the standard property and modern
        // Chromium honours it, so no vendor pseudo-element is needed.
        style={{ scrollbarWidth: "none" }}
      >
        {QUICK_PROMPTS.map((quick) => (
          <button
            key={quick.label}
            type="button"
            disabled={busy}
            onClick={() => void send(quick.prompt ?? quick.label)}
            className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-[var(--border)] bg-[var(--bg-panel2)] px-2.5 py-1 text-[11.5px] text-[var(--text-muted)] transition-colors hover:border-[rgba(91,94,244,0.4)] hover:bg-[rgba(91,94,244,0.15)] hover:text-[#9b9ef8] disabled:opacity-40"
          >
            <span aria-hidden>{quick.icon}</span>
            {quick.label}
          </button>
        ))}
      </div>

      {/* What the next prompt will act on, in one line */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-[var(--border)] px-3.5 py-1.5 text-[11px] text-[var(--text-muted)]">
        <span aria-hidden>{badge.thumb}</span>
        <span className="min-w-0 truncate">
          {timecode(clipSeconds)} · {clipCount} clip{clipCount === 1 ? "" : "s"}
          {selected ? ` · ${selected.name}` : ""}
        </span>
      </div>

      {/* Conversation */}
      <div ref={scrollRef} className="capfree-scroll flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-3.5 py-3">
        {messages.length === 0 && !busy && (
          // Centred in the whole messages area rather than sitting at the top
          // of it, so an empty panel reads as an invitation and not as a
          // conversation that has lost its history.
          <div className="flex flex-1 flex-col items-center justify-center gap-1 px-4 text-center">
            <span className="text-[26px] leading-none" aria-hidden>
              ✨
            </span>
            <p className="text-[12.5px] leading-snug text-[var(--text-muted)]">
              Describe an edit in plain words
            </p>
          </div>
        )}

        {messages.map((message) =>
          message.role === "user" ? (
            <div
              key={message.id}
              className="max-w-[220px] self-end rounded-[10px_10px_3px_10px] bg-[var(--accent)] px-3 py-2 text-[12.5px] leading-snug text-white"
            >
              {message.text}
            </div>
          ) : (
            <div key={message.id} className="max-w-[240px] self-start">
              <div className="rounded-[3px_10px_10px_10px] border border-[var(--border)] bg-[var(--bg-panel2)] px-3 py-2 text-[12.5px] leading-snug text-white">
                {message.text}
              </div>

              {message.edits.length > 0 && (
                <div className="mt-1.5 flex flex-col gap-1">
                  {message.edits.map((edit) => {
                    const gone = undone.has(edit.id);
                    return (
                      <div
                        key={edit.id}
                        className={`flex items-center gap-1.5 rounded-[7px] border border-[var(--border)] bg-[var(--bg-panel2)] px-2.5 py-[5px] text-[11.5px] text-[var(--text-muted)] ${
                          gone ? "opacity-45" : ""
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${gone ? "bg-[#555568]" : DOT_TONE[edit.tone]}`}
                          aria-hidden
                        />
                        <span className={`flex-1 ${gone ? "line-through" : ""}`}>{edit.label}</span>
                        {!gone && (
                          <button
                            type="button"
                            onClick={() => undoEdit(edit)}
                            aria-label={`Undo: ${edit.label}`}
                            title="Undo this edit"
                            className="shrink-0 rounded-[3px] px-1 py-px text-[10px] text-[#555568] transition-colors hover:text-[#ef4444]"
                          >
                            ↩
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {message.notes.length > 0 && (
                <ul className="mt-1.5 flex flex-col gap-1">
                  {message.notes.map((note, index) => (
                    <li key={`${message.id}-note-${index}`} className="text-[11px] leading-snug text-[#f59e0b]">
                      {note}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ),
        )}

        {busy && (
          <div className="max-w-[240px] self-start">
            <Thinking status={status ?? "Processing clip…"} />
          </div>
        )}
      </div>

      {/* What is left of today's allowance, where the eye lands before typing */}
      <p className="shrink-0 px-3.5 pt-2 text-right text-[10.5px] text-[var(--text-muted)]">
        <span className={remaining === 0 ? "text-[#f59e0b]" : "text-[var(--accent)]"}>
          {remaining}
        </span>{" "}
        free edit{remaining === 1 ? "" : "s"} left today
      </p>

      {/* Input */}
      <div className="shrink-0 border-t border-[var(--border)] px-3.5 pb-3 pt-2.5">
        <div className="flex items-end gap-2 rounded-[10px] border border-[var(--border)] bg-[#1f1f24] px-2.5 py-2 transition-colors focus-within:border-[var(--accent)] focus-within:shadow-[0_0_0_2px_rgba(91,94,244,0.15)]">
          <textarea
            ref={inputRef}
            value={prompt}
            rows={1}
            disabled={busy}
            placeholder="Describe what you want to edit…"
            aria-label="Describe what you want to edit"
            onChange={(event) => {
              setPrompt(event.target.value);
              resize(event.target);
            }}
            onKeyDown={(event) => {
              // Enter sends; Shift+Enter is a newline, as in any chat box.
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send(prompt);
              }
            }}
            className="max-h-[72px] min-h-5 flex-1 resize-none bg-transparent text-[12.5px] leading-snug text-white outline-none placeholder:text-[#555568] disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => void send(prompt)}
            disabled={busy || !prompt.trim()}
            aria-label="Send"
            className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[7px] bg-[var(--accent)] transition-all hover:scale-105 hover:opacity-85 disabled:scale-100 disabled:opacity-40"
          >
            <svg viewBox="0 0 14 14" className="h-3.5 w-3.5 fill-white" aria-hidden>
              <path d="M1 7L13 1 7 13 6 8l-5-1z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
