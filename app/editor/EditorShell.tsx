"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  createDefaultDemuxerFactory,
  EditorProvider,
  Preview,
  Timeline,
  framesToSeconds,
  insertMediaAsset,
  usePlayback,
  useTimeline,
  useTimelineEngine,
  useTracks,
  type AssetActivationPayload,
  type Clip,
  type PreviewHandle,
} from "@elah/editor";

/** Real MP4 decode. Without this, Preview paints a color + frame number. */
const demuxerFactory = createDefaultDemuxerFactory();
import {
  applyAutoSave,
  clearAutoSave,
  clipsWithLostMedia,
  readAutoSave,
  type AutoSave,
} from "./autosave";
import { ChevronDown, ChevronUp } from "lucide-react";
import { consumeSticker } from "./stickerDrag";
import { useSelectedClip } from "./useSelectedClip";
import { useAutoSave } from "./useAutoSave";
import { useShortcuts } from "./useShortcuts";
import { RestoreBanner } from "./components/RestoreBanner";
import { ExportModal } from "./components/ExportModal";
import { InspectorPanel } from "./components/InspectorPanel";
import { LeftPanel } from "./components/LeftPanel";
import { PlaybackControls } from "./components/PlaybackControls";
import { TimelineBar } from "./components/TimelineBar";
import { SettingsModal } from "./components/SettingsModal";
import { ToolBar, type EditorTab } from "./components/ToolBar";
import { TopBar } from "./components/TopBar";
import { PreviewLookProvider, usePreviewLook } from "./previewLook";
import { ToastProvider, useToast } from "./components/toast";

const FPS = 30;

/** TimelineBar's own h-9, so collapsing leaves exactly that row showing. */
const TIMELINE_BAR_HEIGHT = 36;
/** Bar + ruler (32) + two 56px tracks, plus 40px of slack for a third. */
const TIMELINE_HEIGHT = 220;

function EditorInner() {
  const previewRef = useRef<PreviewHandle>(null);
  const [showExport, setShowExport] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [timelineCollapsed, setTimelineCollapsed] = useState(false);
  const [tab, setTab] = useState<EditorTab>("media");
  const engine = useTimelineEngine();
  const toast = useToast();
  // Read once on mount: a snapshot found here is offered, not applied.
  const [pending, setPending] = useState<AutoSave | null>(() => readAutoSave());

  // Held off until the offer is resolved, so the minute tick cannot overwrite
  // the snapshot the banner is about to restore.
  useAutoSave(pending === null);
  useShortcuts(FPS);
  const playback = usePlayback();
  const tracks = useTracks();
  const timeline = useTimeline();
  const look = usePreviewLook();
  // The inspector is shown only while a clip is selected; deselecting gives the
  // preview the space back.
  const hasSelection = useSelectedClip() !== null;
  const previewFilter = [look.filterCss, look.effectCss, look.adjustCss].filter(Boolean).join(" ");

  const totalFrames = tracks.totalFrames;
  const totalSeconds = framesToSeconds(totalFrames, FPS);

  const handleAssetActivate = useCallback(
    async (payload: AssetActivationPayload) => {
      if (payload.kind === "media-asset") {
        await insertMediaAsset(timeline, payload.asset.id);
      }
    },
    [timeline],
  );

  useEffect(() => {
    const onAdded = (clip: Clip) => {
      const emoji = consumeSticker(clip);
      if (!emoji) return;
      engine.updateClip(clip.id, clip.trackId, {
        content: emoji,
        name: emoji,
        fontSize: 120,
        textAlign: "center",
      });
    };
    engine.on("clip:added", onAdded);
    return () => engine.off("clip:added", onAdded);
  }, [engine]);

  function restoreSession() {
    if (!pending) return;
    const failure = applyAutoSave(engine, pending);
    setPending(null);
    if (failure) {
      toast(failure, "error");
      return;
    }
    const lost = clipsWithLostMedia(engine);
    toast(
      lost === 0
        ? "Session restored"
        : `Session restored — ${lost} clip${lost === 1 ? "" : "s"} needs its media re-imported`,
      lost === 0 ? "ok" : "error",
    );
  }

  function discardSession() {
    clearAutoSave();
    setPending(null);
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#1a1a1e] text-white">
      <TopBar onExport={() => setShowExport(true)} onSettings={() => setShowSettings(true)} />
      {pending && (
        <RestoreBanner save={pending} onRestore={restoreSession} onDiscard={discardSession} />
      )}
      <ToolBar tab={tab} onTab={setTab} />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <LeftPanel tab={tab} fps={FPS} onAssetActivate={handleAssetActivate} />

        <section className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3 bg-[#1a1a1e] px-4 py-4">
          {/*
            The area the controls leave over. It is far wider than 16:9 -- on a
            1080p window roughly 1368x616, an aspect of 2.2 -- so the stage box
            has to be the largest 16:9 that fits inside it rather than the whole
            thing. Preview's own ResizeObserver hands the renderer whatever this
            box measures, and the renderer letterboxes the project's 16:9 stage
            within that; so a full-width box meant the renderer drew the bars
            itself, up to 276px a side, which read as a small picture in a big
            black frame.

            inset-0 with auto width/height, an aspect ratio and both max
            constraints resolves to exactly that largest fitting box, and
            margin:auto centres it. Now the box and the stage are the same
            shape, so there are no bars and the frame hugs the picture.
          */}
          <div className="relative min-h-0 w-full flex-1">
            <div
              className="capfree-stage absolute inset-0 m-auto aspect-[16/9] max-h-full max-w-full overflow-hidden rounded-lg bg-black shadow-2xl"
              style={{ filter: previewFilter || undefined }}
            >
            <Preview
              ref={previewRef}
              className="h-full w-full"
              enableAudio
              demuxerFactory={demuxerFactory}
            />
            {look.vignette > 0 && (
              <div
                className="pointer-events-none absolute inset-0"
                style={{ boxShadow: `inset 0 0 ${40 + look.vignette * 1.4}px rgba(0,0,0,${0.25 + look.vignette / 180})` }}
              />
            )}
            {look.grain > 0 && (
              /* The class carries the noise; the slider scales how much shows. */
              <div
                className="capfree-grain pointer-events-none absolute inset-0"
                style={{ opacity: (look.grain / 100) * 0.5 }}
              />
            )}
            {look.reframe && (
              <div
                className="pointer-events-none absolute border-2 border-[#ffffff]"
                style={{
                  left: `${look.reframe.x * 100}%`,
                  top: `${look.reframe.y * 100}%`,
                  width: `${look.reframe.width * 100}%`,
                  height: `${look.reframe.height * 100}%`,
                  boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)",
                }}
              />
            )}
            </div>
          </div>
          <PlaybackControls
            isPlaying={playback.isPlaying}
            currentFrame={playback.currentFrame}
            totalFrames={totalFrames}
            fps={FPS}
            loop={playback.loop}
            onPlay={playback.play}
            onPause={playback.pause}
            onSeek={playback.setCurrentFrame}
            onToggleLoop={playback.toggleLoop}
            totalSeconds={totalSeconds}
          />
        </section>

        {/*
          Width animates rather than the panel unmounting: an element that is
          gone cannot transition. The inner aside keeps its fixed 280px, so the
          panel slides out of a clipping box instead of its contents reflowing
          on every frame.

          Driven straight off the selection store via useSelectedClip, so there
          is no second copy of "is something selected" to keep in step.
        */}
        <div
          className="shrink-0 overflow-hidden transition-[width] duration-200 ease-out"
          style={{ width: hasSelection ? 280 : 0 }}
          aria-hidden={!hasSelection}
          // A zero-width box still holds focusable inputs, so the collapsed
          // panel is taken out of the tab order too, not just hidden.
          inert={!hasSelection}
        >
          <InspectorPanel fps={FPS} />
        </div>
      </div>

      {/*
        220px expanded: the bar (36) plus the ruler (32) plus two 56px tracks
        needs 180, so this keeps 40px of slack to show a third row starting.
        Collapsed is exactly the bar's own h-9, so the row is never clipped.

        The preview is limited by height rather than width, so this band is the
        one dial that makes the picture bigger -- which is the whole point of
        being able to fold it away.
      */}
      <div
        className="flex shrink-0 flex-col overflow-hidden border-t border-[#34343a] bg-[#1a1a1e] transition-[height] duration-200 ease-out"
        style={{ height: timelineCollapsed ? TIMELINE_BAR_HEIGHT : TIMELINE_HEIGHT }}
      >
        <div className="flex shrink-0 items-stretch">
          <button
            type="button"
            onClick={() => setTimelineCollapsed((on) => !on)}
            aria-expanded={!timelineCollapsed}
            title={timelineCollapsed ? "Show tracks" : "Hide tracks"}
            aria-label={timelineCollapsed ? "Show tracks" : "Hide tracks"}
            className="flex w-7 shrink-0 items-center justify-center border-b border-r border-[#34343a] bg-[#2a2a2e] text-[#888] transition-colors hover:text-white"
          >
            {timelineCollapsed ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>
          <div className="min-w-0 flex-1">
            <TimelineBar fps={FPS} />
          </div>
        </div>
        {/* Collapsed this is zero-height; the clips inside stay focusable
            unless the box is taken out of the tab order too. */}
        <div
          className="min-h-0 flex-1 overflow-hidden"
          data-capfree-timeline
          aria-hidden={timelineCollapsed}
          inert={timelineCollapsed}
        >
          {/* compactSidebar suppresses both the track name and the
              eye/lock buttons in TrackRow, so it stays off for the labels to
              read "Video 1" / "Audio 1" with their controls. */}
          <Timeline className="h-full" compactSidebar={false} />
        </div>
      </div>

      {showExport && <ExportModal onClose={() => setShowExport(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}

/** Never notifies: the snapshot flips once, when the client takes over. */
const subscribeNever = () => () => {};

export function EditorShell() {
  // EditorProvider uses Math.random for track IDs. Defer until after mount so
  // Next cacheComponents prerender does not blank /editor.
  const ready = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
  if (!ready) return <div className="h-full bg-[#1a1a1e]" />;

  return (
    <EditorProvider
      fps={FPS}
      stage={{ width: 1920, height: 1080 }}
      defaultTrackHeight={56}
      maxHistorySize={80}
      initialTracks={[
        { kind: "video", name: "Video 1" },
        { kind: "audio", name: "Audio 1" },
      ]}
    >
      <ToastProvider>
        <PreviewLookProvider>
          <EditorInner />
        </PreviewLookProvider>
      </ToastProvider>
    </EditorProvider>
  );
}
