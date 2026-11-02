"use client";

import { useState } from "react";
import { FlipHorizontal2, FlipVertical2 } from "lucide-react";
import { framesToTimecode, splitClipAtPlayhead, useTimelineEngine, type Transform } from "@elah/editor";
import { deleteSelection, withTransform } from "../clipEdit";
import { FONT_LIST, FILTER_LOOKS, mixFilter } from "../visuals";
import { fieldClass } from "./panelUi";
import { useToast } from "./toast";
import { useSelectedClip } from "../useSelectedClip";
import { usePreviewLook } from "../previewLook";

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
        className="w-full accent-[#00d4b4]"
      />
    </label>
  );
}

export function InspectorPanel({ fps }: { fps: number }) {
  const engine = useTimelineEngine();
  const selected = useSelectedClip();
  const [speedDraft, setSpeedDraft] = useState<number | null>(null);
  const [draftClipId, setDraftClipId] = useState<string | null>(null);

  // Drop the draft when the selection moves to another clip. Adjusting state
  // during render beats an effect: no second commit, no flash of a stale draft.
  const selectedId = selected?.clip.id ?? null;
  if (draftClipId !== selectedId) {
    setDraftClipId(selectedId);
    setSpeedDraft(null);
  }

  return (
    <aside className="capfree-scroll w-[260px] shrink-0 overflow-y-auto border-l border-[#2a2a30] bg-[#111114]">
      <div className="px-3 py-3">
        <h2 className="text-[13px] font-semibold text-white">Inspector</h2>
        {!selected ? (
          <p className="mt-3 text-[12px] leading-snug text-[#888899]">Select a clip to edit</p>
        ) : (
          <InspectorFields
            fps={fps}
            speedDraft={speedDraft}
            onSpeedDraft={setSpeedDraft}
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
  speedDraft,
  onSpeedDraft,
  engine,
  fps,
}: {
  clipId: string;
  trackId: string;
  speedDraft: number | null;
  onSpeedDraft: (value: number | null) => void;
  engine: ReturnType<typeof useTimelineEngine>;
  fps: number;
}) {
  const toast = useToast();
  const look = usePreviewLook();
  const selected = useSelectedClip();
  const [name, setName] = useState(selected?.clip.name ?? "");
  const [nameSource, setNameSource] = useState(selected?.clip.name ?? "");
  const [filterLevel, setFilterLevel] = useState(100);

  // Re-seed the name field whenever the clip, or its committed name, changes.
  const committedName = selected?.clip.name ?? "";
  const nameKey = `${selected?.clip.id ?? ""}:${committedName}`;
  if (nameSource !== nameKey) {
    setNameSource(nameKey);
    setName(committedName);
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
  const reversed = signedSpeed < 0;
  const speed = speedDraft ?? Math.abs(signedSpeed);
  const hasVolume = clip.type === "video" || clip.type === "audio";
  const volume = Math.round((clip.volume ?? 1) * 100);
  const isVideo = clip.type === "video";

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

  function setAxis(axis: "x" | "y", raw: string) {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    preview({ [axis]: Math.min(100, Math.max(0, parsed)) / 100 });
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

  return (
    <div className="mt-3 flex flex-col gap-3">
      <label className="text-[11px] text-[#c8c8ce]">
        Name
        <input
          value={name}
          aria-label="Clip name"
          onChange={(event) => setName(event.target.value)}
          onBlur={() => engine.updateClip(clip.id, trackId, { name: name.trim() || clip.type })}
          className={`${fieldClass} mt-1`}
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px] text-[#c8c8ce]">
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
        <label className="text-[11px] text-[#c8c8ce]">
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

      <SliderRow
        label="Scale"
        min={0}
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
      <SliderRow
        label="Speed"
        min={0.1}
        max={4}
        step={0.1}
        value={speed}
        display={`${speed.toFixed(1)}x`}
        disabled={!isVideo}
        onChange={(value) => onSpeedDraft(value)}
        onCommit={(value) => {
          if (!isVideo) return;
          onSpeedDraft(null);
          engine.setClipSpeed(clip.id, trackId, value);
          if (reversed) {
            const live = engine.findClip(clip.id);
            const magnitude = Math.abs(live?.clip.speed ?? value);
            engine.updateClip(clip.id, trackId, { speed: -magnitude });
          }
        }}
      />
      <label className="flex items-center justify-between text-[11px] text-[#c8c8ce]">
        Reverse
        <input
          type="checkbox"
          checked={reversed}
          disabled={!isVideo}
          aria-label="Reverse"
          className="accent-[#00d4b4]"
          onChange={() => {
            if (!isVideo) return;
            const magnitude = Math.abs(signedSpeed) || 1;
            engine.updateClip(clip.id, trackId, { speed: reversed ? magnitude : -magnitude });
          }}
        />
      </label>
      <p className="text-[10px] text-[#888899]">Saved on the clip. Preview playback stays forward.</p>
      {!isVideo && <p className="text-[10px] text-[#888899]">Speed applies to video clips.</p>}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => flip("scaleX")}
          className="flex h-8 items-center justify-center gap-1 rounded-md border border-[#3a3a40] bg-[#1a1a1e] text-[11px] text-white hover:border-[#00d4b4]"
        >
          <FlipHorizontal2 className="h-3.5 w-3.5" />
          Flip H
        </button>
        <button
          type="button"
          onClick={() => flip("scaleY")}
          className="flex h-8 items-center justify-center gap-1 rounded-md border border-[#3a3a40] bg-[#1a1a1e] text-[11px] text-white hover:border-[#00d4b4]"
        >
          <FlipVertical2 className="h-3.5 w-3.5" />
          Flip V
        </button>
      </div>

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

      {hasVolume && (
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
        className="h-8 rounded-md border border-[#2a2a30] bg-[#2a2a30] text-[12px] text-white transition-colors duration-150 hover:border-[#00d4b4]"
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
