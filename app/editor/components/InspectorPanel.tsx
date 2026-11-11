"use client";

import { useRef, useState } from "react";
import {
  Eraser,
  FlipHorizontal2,
  FlipVertical2,
  MousePointerClick,
  Rewind,
  Snowflake,
  X,
} from "lucide-react";
import { applySpeedPreset, clearSpeedRemap, hasTimeRemap, matchSpeedPreset } from "@elah/core";
import {
  framesToSeconds,
  framesToTimecode,
  splitClipAtPlayhead,
  useTimelineEngine,
  type Transform,
} from "@elah/editor";
import {
  cancelRemoveVideoBg,
  requestRemoveVideoBg,
  requestRemoveVideoBgResult,
  requestRemoveVideoBgStatus,
} from "../api";
import { playheadFrame } from "../captionActions";
import { deleteSelection, withTransform } from "../clipEdit";
import { freezeFrameAt } from "../freezeFrame";
import { fileFromClip, replaceClipFile } from "../timelineMedia";
import { FONT_LIST, FILTER_LOOKS, mixFilter } from "../visuals";
import { SubTabs } from "./chrome";
import { fieldClass } from "./panelUi";
import { useToast } from "./toast";
import { useSelectedClip } from "../useSelectedClip";
import { usePreviewLook } from "../previewLook";

/**
 * Marks a clip whose background has been cut. The SDK's Timeline draws the clip
 * name and offers no badge slot of its own -- `labelColor` is declared on Clip
 * but nothing in the editor reads it -- so the name carries the marker there,
 * and the Inspector shows a proper badge.
 */
const NO_BG_PREFIX = "No BG · ";

/** How often the removal job is polled while it runs. */
const BG_POLL_MS = 1500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/** The range engine.setClipSpeed enforces; mirrored so the UI cannot lie. */
const MIN_SPEED = 0.25;
const MAX_SPEED = 4;
const SPEED_PRESETS = [0.25, 0.5, 1, 1.5, 2, 4];
/** Video clips get these three groups; audio and text have too few to split. */
const CLIP_TABS = ["Basic", "Speed", "Transform"] as const;

/** Longer fades than this belong on the timeline, not in a sidebar slider. */
const MAX_FADE_SEC = 5;

function SliderRow({
  label,
  min,
  max,
  step,
  value,
  display,
  disabled,
  onChange,
  onCommit,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  display: string;
  disabled?: boolean;
  onChange: (value: number) => void;
  onCommit: (value: number) => void;
}) {
  return (
    <label className={`flex flex-col gap-1 text-[11px] text-[#c8c8ce] ${disabled ? "opacity-40" : ""}`}>
      <span className="flex items-center justify-between">
        {label}
        <span className="font-mono text-[#9a9aa2]">{display}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => onChange(Number(event.target.value))}
        onPointerUp={(event) => onCommit(Number(event.currentTarget.value))}
        onBlur={(event) => onCommit(Number(event.currentTarget.value))}
        className="w-full accent-[#ffffff]"
      />
    </label>
  );
}

export function InspectorPanel({ fps }: { fps: number }) {
  const engine = useTimelineEngine();
  const selected = useSelectedClip();
  const [speedInput, setSpeedInput] = useState<string | null>(null);
  const [draftClipId, setDraftClipId] = useState<string | null>(null);

  // Drop the draft when the selection moves to another clip. Adjusting state
  // during render beats an effect: no second commit, no flash of a stale draft.
  const selectedId = selected?.clip.id ?? null;
  if (draftClipId !== selectedId) {
    setDraftClipId(selectedId);
    setSpeedInput(null);
  }

  return (
    <aside className="capfree-scroll h-full w-[280px] shrink-0 overflow-y-auto border-l border-[#2a2a30] bg-[#111114]">
      <div className="px-3 py-3">
        <h2 className="text-[13px] font-semibold text-white">Inspector</h2>
        {!selected ? (
          <div className="mt-6 flex flex-col items-center gap-2 text-center">
            <MousePointerClick className="h-4 w-4 text-[#888899]" aria-hidden />
            <p className="text-[12px] leading-snug text-[#888899]">Select a clip to edit</p>
          </div>
        ) : (
          <InspectorFields
            fps={fps}
            speedInput={speedInput}
            onSpeedInput={setSpeedInput}
            clipId={selected.clip.id}
            trackId={selected.trackId}
            engine={engine}
          />
        )}
      </div>
    </aside>
  );
}

function InspectorFields({
  clipId,
  trackId,
  speedInput,
  onSpeedInput,
  engine,
  fps,
}: {
  clipId: string;
  trackId: string;
  speedInput: string | null;
  onSpeedInput: (value: string | null) => void;
  engine: ReturnType<typeof useTimelineEngine>;
  fps: number;
}) {
  const toast = useToast();
  const look = usePreviewLook();
  const selected = useSelectedClip();
  // For a text clip the field edits the words on screen; for anything else it
  // edits the timeline label. Both live in this one input.
  const labelOf = (hit: typeof selected) =>
    hit ? (hit.clip.type === "text" ? (hit.clip.content ?? "") : hit.clip.name) : "";
  const [name, setName] = useState(() => labelOf(selected));
  const [nameSource, setNameSource] = useState("");
  const [filterLevel, setFilterLevel] = useState(100);
  const [freezing, setFreezing] = useState(false);
  const [tab, setTab] = useState<string>("Basic");
  const [bgLabel, setBgLabel] = useState<string | null>(null);
  const bgCancelled = useRef(false);

  // Re-seed whenever the clip, or the value it is bound to, changes. Selecting
  // a text clip on the timeline therefore shows its current words right away.
  const committedLabel = labelOf(selected);
  const nameKey = `${selected?.clip.id ?? ""}:${committedLabel}`;
  if (nameSource !== nameKey) {
    setNameSource(nameKey);
    setName(committedLabel);
  }
  if (!selected || selected.clip.id !== clipId) return null;
  const { clip } = selected;
  const transform = clip.transform;
  const x = Math.round((transform?.x ?? 0.5) * 100);
  const y = Math.round((transform?.y ?? 0.5) * 100);
  const scale = Math.round((transform?.scale ?? 1) * 100);
  const rotation = Math.round(((transform?.rotation ?? 0) * 180) / Math.PI);
  const opacity = Math.round((clip.opacity ?? 1) * 100);
  const signedSpeed = clip.speed ?? 1;
  const speed = Math.abs(signedSpeed);
  const hasVolume = clip.type === "video" || clip.type === "audio";
  const volume = Math.round((clip.volume ?? 1) * 100);
  const fadeIn = clip.audio?.fadeInSec ?? 0;
  const fadeOut = clip.audio?.fadeOutSec ?? 0;
  const isVideo = clip.type === "video";
  // Reverse is a time remap, not a negative speed: sourceFrameFor only honours
  // the keyframe channel, so a negative clip.speed never actually played back.
  const timeKeys = clip.keyframes?.channels?.time?.keys ?? [];
  const reversed = isVideo && timeKeys.length > 0 && matchSpeedPreset(clip, timeKeys) === "reverse";
  // setClipSpeed refuses a clip whose timing is already driven by keyframes.
  const canSetSpeed = isVideo && !hasTimeRemap(clip);

  function preview(patch: Partial<Transform> & { opacity?: number; volume?: number }) {
    const { opacity: nextOpacity, volume: nextVolume, ...transformPatch } = patch;
    engine.previewClip(clip.id, trackId, {
      ...(nextOpacity !== undefined ? { opacity: nextOpacity } : {}),
      ...(nextVolume !== undefined ? { volume: nextVolume } : {}),
      ...(Object.keys(transformPatch).length > 0
        ? { transform: withTransform(clip, transformPatch) }
        : {}),
    });
  }

  function commit(label: string) {
    engine.commitInteraction(label);
  }

  /** Clamped to the engine's own range, so the field cannot promise more. */
  function commitSpeed(value: number) {
    onSpeedInput(null);
    if (!canSetSpeed || !Number.isFinite(value)) return;
    engine.setClipSpeed(clip.id, trackId, Math.min(MAX_SPEED, Math.max(MIN_SPEED, value)));
  }

  function freezeHere() {
    if (freezing) return;
    setFreezing(true);
    freezeFrameAt(engine, { clip, trackId }, playheadFrame(), fps)
      .then(() => toast("Freeze frame added at the playhead"))
      .catch((error: unknown) => {
        toast(error instanceof Error ? error.message : "Could not freeze that frame.", "error");
      })
      .finally(() => setFreezing(false));
  }

  /**
   * Cuts the background off this clip and swaps the result in.
   *
   * Polled rather than awaited in one request: rembg is ~1.2-2.6s a frame on
   * CPU, so this is minutes of work, and the server caps it at 30s of source.
   * A clip longer than that comes back shortened, which the toast says plainly.
   */
  async function removeBackground() {
    if (bgLabel !== null) return;
    bgCancelled.current = false;
    setBgLabel("Uploading…");
    let jobId: string | null = null;
    try {
      const source = await fileFromClip(clip);
      const job = await requestRemoveVideoBg(source, "u2net");
      jobId = job.jobId;
      setBgLabel(`Removing background… 0/${job.framesTotal}`);

      let settled = null as Awaited<ReturnType<typeof requestRemoveVideoBgStatus>> | null;
      while (!bgCancelled.current) {
        await sleep(BG_POLL_MS);
        if (bgCancelled.current) break;
        const status = await requestRemoveVideoBgStatus(job.jobId);
        if (status.status === "error") throw new Error(status.error ?? "Background removal failed");
        if (status.status === "done") {
          settled = status;
          break;
        }
        const eta =
          status.etaSeconds !== null && status.etaSeconds > 0
            ? ` · ~${Math.ceil(status.etaSeconds / 60)} min left`
            : "";
        setBgLabel(
          status.status === "encoding"
            ? "Encoding transparent video…"
            : `Removing background… ${status.framesDone}/${status.framesTotal}${eta}`,
        );
      }

      if (bgCancelled.current || !settled) return;

      setBgLabel("Importing…");
      const blob = await requestRemoveVideoBgResult(job.jobId);
      const base = clip.name.startsWith(NO_BG_PREFIX)
        ? clip.name.slice(NO_BG_PREFIX.length)
        : clip.name;
      // WebM, not MP4: H.264 has no alpha pixel format, so the transparent
      // render is VP9. The importer detects its alpha and flags the asset.
      const file = new File([blob], `${NO_BG_PREFIX}${base}.webm`, { type: "video/webm" });
      await replaceClipFile(engine, { clip, trackId }, file, "video", fps);
      engine.updateClip(clip.id, trackId, { name: `${NO_BG_PREFIX}${base}` });

      const shortened = job.secondsProcessed + 0.5 < framesToSeconds(clip.durationFrames, fps);
      toast(
        shortened
          ? `Background removed — first ${job.secondsProcessed.toFixed(1)}s only, at ${job.outputFps}fps`
          : `Background removed at ${job.outputFps}fps`,
      );
    } catch (error: unknown) {
      if (jobId) void cancelRemoveVideoBg(jobId);
      toast(
        error instanceof Error ? error.message : "Could not remove the background.",
        "error",
      );
    } finally {
      setBgLabel(null);
    }
  }

  function cancelBackground() {
    bgCancelled.current = true;
    setBgLabel(null);
    toast("Background removal cancelled");
  }

  function toggleReverse() {
    if (!isVideo) return;
    const patch = reversed ? clearSpeedRemap(clip) : applySpeedPreset(clip, "reverse");
    // A negative speed left by an older project was never honoured; normalise
    // it so the two mechanisms cannot disagree about which way the clip runs.
    engine.updateClip(clip.id, trackId, { ...patch, speed: Math.abs(signedSpeed) || 1 });
  }

  function setAxis(axis: "x" | "y", raw: string) {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    preview({ [axis]: Math.min(100, Math.max(0, parsed)) / 100 });
  }

  /** Fades live on clip.audio, so the other audio settings have to survive. */
  function setFade(key: "fadeInSec" | "fadeOutSec", seconds: number) {
    const next = { ...clip.audio, [key]: seconds };
    if (seconds <= 0) delete next[key];
    engine.previewClip(clip.id, trackId, {
      audio: Object.keys(next).length > 0 ? next : undefined,
    });
  }

  function flip(axis: "scaleX" | "scaleY") {
    engine.commitInteraction("Flip");
    const live = engine.findClip(clip.id);
    if (!live) return;
    const current = live.clip.transform?.[axis] ?? 1;
    engine.updateClip(live.clip.id, live.trackId, {
      transform: withTransform(live.clip, { [axis]: current === 0 ? -1 : -current }),
    });
  }

  const isText = clip.type === "text";
  const noBackground = clip.name.startsWith(NO_BG_PREFIX);

  // Only video has enough controls to be worth splitting. Everything else
  // keeps its single column, so no control becomes harder to find than it was.
  const tabbed = isVideo;
  const onBasic = !tabbed || tab === "Basic";
  const onSpeed = !tabbed || tab === "Speed";
  const onTransform = !tabbed || tab === "Transform";
  /** What the clip actually occupies now, which is what a speed change moves. */
  const durationSec = framesToSeconds(clip.durationFrames, fps);

  /**
   * Commits the field. Emptying a text clip deletes it: a text clip with no
   * words draws nothing, so leaving it behind would put an invisible,
   * un-selectable block on the timeline.
   */
  function commitLabel() {
    const value = name.trim();
    if (isText) {
      if (!value) {
        engine.removeClip(clip.id, trackId);
        toast("Empty text clip removed");
        return;
      }
      // Name tracks the content so the timeline block stays recognisable.
      engine.updateClip(clip.id, trackId, { content: value, name: value.slice(0, 40) });
      return;
    }
    engine.updateClip(clip.id, trackId, { name: value || clip.type });
  }

  return (
    <div className="mt-3 flex flex-col gap-3">
      <label className="text-[12px] font-semibold text-[#c8c8ce]">
        {isText ? "Text" : "Name"}
        <input
          value={name}
          aria-label={isText ? "Text content" : "Clip name"}
          placeholder={isText ? "Type text, or clear to delete" : undefined}
          onChange={(event) => setName(event.target.value)}
          onBlur={commitLabel}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          className={`${fieldClass} mt-1`}
        />
        {isText && (
          <span className="mt-1 block text-[10px] leading-snug text-[#888899]">
            Clearing this removes the clip.
          </span>
        )}
      </label>

      {tabbed && (
        <div className="-mx-3">
          <SubTabs tabs={CLIP_TABS} value={tab} onChange={setTab} />
        </div>
      )}

      {onTransform && (
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[12px] font-semibold text-[#c8c8ce]">
          X
          <input
            type="number"
            min={0}
            max={100}
            value={x}
            aria-label="Position X"
            onChange={(event) => setAxis("x", event.target.value)}
            onBlur={() => commit("Position")}
            className={`${fieldClass} mt-1`}
          />
        </label>
        <label className="text-[12px] font-semibold text-[#c8c8ce]">
          Y
          <input
            type="number"
            min={0}
            max={100}
            value={y}
            aria-label="Position Y"
            onChange={(event) => setAxis("y", event.target.value)}
            onBlur={() => commit("Position")}
            className={`${fieldClass} mt-1`}
          />
        </label>
      </div>
      )}

      {onTransform && (
        <>
          <SliderRow
            label="Scale"
            min={10}
            max={200}
            step={1}
            value={scale}
            display={`${scale}%`}
            onChange={(value) => preview({ scale: value / 100 })}
            onCommit={() => commit("Scale")}
          />
          <SliderRow
            label="Rotation"
            min={-180}
            max={180}
            step={1}
            value={rotation}
            display={`${rotation}°`}
            onChange={(value) => preview({ rotation: (value * Math.PI) / 180 })}
            onCommit={() => commit("Rotation")}
          />
        </>
      )}

      {onBasic && (
        <SliderRow
          label="Opacity"
          min={0}
          max={100}
          step={1}
          value={opacity}
          display={`${opacity}%`}
          onChange={(value) => preview({ opacity: value / 100 })}
          onCommit={() => commit("Opacity")}
        />
      )}

      {onSpeed && (
      <div className={`flex flex-col gap-1.5 ${canSetSpeed ? "" : "opacity-40"}`}>
        <span className="flex items-center justify-between text-[11px] text-[#c8c8ce]">
          Speed
          <span className="font-mono text-[#9a9aa2]">{speed.toFixed(2)}x</span>
        </span>
        <div className="grid grid-cols-3 gap-1">
          {SPEED_PRESETS.map((preset) => {
            const on = Math.abs(speed - preset) < 0.001;
            return (
              <button
                key={preset}
                type="button"
                disabled={!canSetSpeed}
                aria-pressed={on}
                onClick={() => commitSpeed(preset)}
                className={`h-7 rounded-md border text-[11px] text-white transition-colors duration-150 ${
                  on ? "border-[#ffffff] bg-[#1e1e24]" : "border-[#3a3a40] bg-[#1a1a1e] hover:border-[#ffffff]"
                }`}
              >
                {preset}x
              </button>
            );
          })}
        </div>
        <SliderRow
          label="Multiplier"
          min={MIN_SPEED}
          max={MAX_SPEED}
          step={0.05}
          value={speed}
          display={`${speed.toFixed(2)}x`}
          disabled={!canSetSpeed}
          onChange={(value) => onSpeedInput(value.toFixed(2))}
          onCommit={(value) => commitSpeed(value)}
        />
        <label className="text-[11px] text-[#c8c8ce]">
          Custom
          <input
            type="number"
            min={MIN_SPEED}
            max={MAX_SPEED}
            step={0.05}
            value={speedInput ?? speed.toFixed(2)}
            disabled={!canSetSpeed}
            aria-label="Custom speed"
            onChange={(event) => onSpeedInput(event.target.value)}
            onBlur={(event) => commitSpeed(Number(event.target.value))}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            className={`${fieldClass} mt-1`}
          />
        </label>
        <p className="text-[11px] text-[#c8c8ce]">
          New duration: <span className="font-mono text-white">{durationSec.toFixed(1)}s</span>
        </p>
        <p className="text-[10px] leading-snug text-[#888899]">
          The engine clamps speed to {MIN_SPEED}x–{MAX_SPEED}x.
        </p>
      </div>
      )}
      {onSpeed && (
      <button
        type="button"
        disabled={!isVideo}
        aria-pressed={reversed}
        onClick={toggleReverse}
        className={`flex h-8 items-center justify-center gap-1 rounded-md border text-[11px] text-white transition-colors duration-150 disabled:opacity-40 ${
          reversed
            ? "border-[#ffffff] bg-[#1e1e24]"
            : "border-[#3a3a40] bg-[#1a1a1e] hover:border-[#ffffff]"
        }`}
      >
        <Rewind className="h-3.5 w-3.5" aria-hidden />
        {reversed ? "Reversed" : "Reverse"}
      </button>
      )}
      {onSpeed && isVideo && !canSetSpeed && (
        <p className="text-[10px] leading-snug text-[#888899]">
          Time keyframes drive this clip, so the speed controls stay off until you clear them.
        </p>
      )}
      {isVideo && (
        <>
          <button
            type="button"
            disabled={freezing}
            onClick={freezeHere}
            className="flex h-8 items-center justify-center gap-1 rounded-md border border-[#3a3a40] bg-[#1a1a1e] text-[11px] text-white transition-colors duration-150 hover:border-[#ffffff] disabled:opacity-40"
          >
            <Snowflake className="h-3.5 w-3.5" aria-hidden />
            {freezing ? "Freezing…" : "Freeze here"}
          </button>
          <p className="text-[10px] leading-snug text-[#888899]">
            Adds a 2-second still of the frame under the playhead, on the first free video track.
          </p>

          {noBackground && (
            <span className="flex items-center gap-1 self-start rounded-[4px] bg-[#ffffff] px-1.5 py-0.5 text-[9px] font-semibold text-black">
              <Eraser className="h-2.5 w-2.5" aria-hidden />
              Background Removed
            </span>
          )}

          {bgLabel === null ? (
            <button
              type="button"
              onClick={() => void removeBackground()}
              className="flex h-8 items-center justify-center gap-1 rounded-md border border-[#3a3a40] bg-[#1a1a1e] text-[11px] text-white transition-colors duration-150 hover:border-[#ffffff]"
            >
              <Eraser className="h-3.5 w-3.5" aria-hidden />
              {noBackground ? "Remove background again" : "Remove Background"}
            </button>
          ) : (
            <div className="flex flex-col gap-1 rounded-md border border-[#3a3a40] bg-[#1a1a1e] px-2 py-1.5">
              <span className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1 truncate text-[10px] text-white">{bgLabel}</span>
                <button
                  type="button"
                  onClick={cancelBackground}
                  aria-label="Cancel background removal"
                  className="grid h-4 w-4 shrink-0 place-items-center rounded text-[#888899] transition-colors hover:text-white"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            </div>
          )}
          <p className="text-[10px] leading-snug text-[#888899]">
            Cuts the subject out frame by frame on the server. Minutes of CPU, capped at the
            first 30 seconds, and the result is a transparent WebM.
          </p>
        </>
      )}
      {!isVideo && (
        <p className="text-[10px] text-[#888899]">Speed and reverse apply to video clips.</p>
      )}

      {onBasic && (
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => flip("scaleX")}
          className="flex h-8 items-center justify-center gap-1 rounded-md border border-[#3a3a40] bg-[#1a1a1e] text-[11px] text-white hover:border-[#ffffff]"
        >
          <FlipHorizontal2 className="h-3.5 w-3.5" />
          Flip H
        </button>
        <button
          type="button"
          onClick={() => flip("scaleY")}
          className="flex h-8 items-center justify-center gap-1 rounded-md border border-[#3a3a40] bg-[#1a1a1e] text-[11px] text-white hover:border-[#ffffff]"
        >
          <FlipVertical2 className="h-3.5 w-3.5" />
          Flip V
        </button>
      </div>
      )}

      {clip.type === "text" && (
        <>
          <label className="text-[11px] text-[#c8c8ce]">
            Content
            <textarea
              defaultValue={String(clip.content ?? "")}
              key={clip.id}
              rows={3}
              aria-label="Text content"
              onBlur={(event) => engine.updateClip(clip.id, trackId, { content: event.target.value })}
              className={`${fieldClass} mt-1`}
            />
          </label>
          <label className="text-[11px] text-[#c8c8ce]">
            Font
            <select
              value={clip.fontFamily ?? "Inter"}
              aria-label="Font"
              onChange={(event) => engine.updateClip(clip.id, trackId, { fontFamily: event.target.value })}
              className={`${fieldClass} mt-1`}
            >
              {FONT_LIST.map((font) => (
                <option key={font}>{font}</option>
              ))}
            </select>
          </label>
          <SliderRow
            label="Size"
            min={12}
            max={160}
            step={1}
            value={clip.fontSize ?? 64}
            display={`${clip.fontSize ?? 64}`}
            onChange={(value) => engine.previewClip(clip.id, trackId, { fontSize: value })}
            onCommit={(value) => {
              engine.updateClip(clip.id, trackId, { fontSize: value });
            }}
          />
          <label className="text-[11px] text-[#c8c8ce]">
            Color
            <input
              type="color"
              value={clip.color ?? "#ffffff"}
              aria-label="Text color"
              onChange={(event) => engine.updateClip(clip.id, trackId, { color: event.target.value })}
              className="mt-1 h-8 w-full bg-transparent"
            />
          </label>
          <label className="text-[11px] text-[#c8c8ce]">
            Align
            <select
              value={clip.textAlign ?? "center"}
              aria-label="Text align"
              onChange={(event) =>
                engine.updateClip(clip.id, trackId, { textAlign: event.target.value as "left" | "center" | "right" })
              }
              className={`${fieldClass} mt-1`}
            >
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </label>
        </>
      )}

      {look.activeFilter && (
        <SliderRow
          label="Filter intensity"
          min={0}
          max={100}
          step={1}
          value={filterLevel}
          display={`${filterLevel}`}
          onChange={(value) => {
            setFilterLevel(value);
            const card = FILTER_LOOKS.find((item) => item.name === look.activeFilter);
            if (!card) return;
            const mixed = mixFilter(card.css, value);
            look.setFilter(card.name, mixed === "none" ? "" : mixed);
          }}
          onCommit={() => undefined}
        />
      )}
      {look.activeEffect && <p className="text-[11px] text-[#c8c8ce]">Effect · {look.activeEffect}</p>}

      {hasVolume && onBasic && (
        <>
          <SliderRow
            label="Volume"
            min={0}
            max={100}
            step={1}
            value={volume}
            display={`${volume}%`}
            onChange={(value) => preview({ volume: value / 100 })}
            onCommit={() => commit("Volume")}
          />
          <SliderRow
            label="Fade in"
            min={0}
            max={MAX_FADE_SEC}
            step={0.1}
            value={fadeIn}
            display={`${fadeIn.toFixed(1)}s`}
            onChange={(value) => setFade("fadeInSec", value)}
            onCommit={() => commit("Fade in")}
          />
          <SliderRow
            label="Fade out"
            min={0}
            max={MAX_FADE_SEC}
            step={0.1}
            value={fadeOut}
            display={`${fadeOut.toFixed(1)}s`}
            onChange={(value) => setFade("fadeOutSec", value)}
            onCommit={() => commit("Fade out")}
          />
        </>
      )}

      <div className="grid grid-cols-2 gap-2 text-[11px] text-[#888899]">
        <p>Start <span className="font-mono text-white">{framesToTimecode(clip.startFrame, fps)}</span></p>
        <p>End <span className="font-mono text-white">{framesToTimecode(clip.startFrame + clip.durationFrames, fps)}</span></p>
      </div>
      <button
        type="button"
        onClick={() => {
          const result = splitClipAtPlayhead(engine);
          if (!result.ok) toast("Move the playhead inside the clip.", "error");
          else toast("Clip split");
        }}
        className="h-8 rounded-md border border-[#2a2a30] bg-[#2a2a30] text-[12px] text-white transition-colors duration-150 hover:border-[#ffffff]"
      >
        Split at Playhead
      </button>
      <button
        type="button"
        onClick={() => {
          const error = deleteSelection(engine);
          if (error) toast(error, "error");
          else toast("Clip deleted");
        }}
        className="h-8 rounded-md bg-red-600 text-[12px] text-white transition-colors duration-150 hover:bg-red-500"
      >
        Delete Clip
      </button>
    </div>
  );
}
