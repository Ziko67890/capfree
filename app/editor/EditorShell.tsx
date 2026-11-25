"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  createDefaultDemuxerFactory,
  EditorProvider,
  Preview,
  Timeline,
  framesToSeconds,
  insertMediaAsset,
  usePlaybackStore,
  useTimelineEngine,
  useTracksStore,
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
import { playheadFrame, seekFrame } from "./captionActions";
import { useSelectedClip } from "./useSelectedClip";
import { useAutoSave } from "./useAutoSave";
import { usePlayheadFollow } from "./usePlayheadFollow";
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
/** Bar + ruler (32) + two 56px tracks — kept compact so preview gets more height. */
const TIMELINE_HEIGHT = 160;
/**
 * The SDK's own default, stated here because usePlayheadFollow has to place the
 * needle by the same arithmetic the Timeline does. Passed to both so the two
 * cannot drift apart.
 */
const TIMELINE_SIDEBAR_WIDTH = 184;

/** How far a press may wander and still count as a click rather than a drag. */
const CLICK_SLOP_PX = 4;

/**
 * Whether a click on the stage reached the picture itself.
 *
 * While the transport is paused the SDK stacks editing overlays over the
 * canvas — click to select, drag to move, handles to resize and crop,
 * double-click to edit text — and draws a full-size box over every visible
 * clip, so on a full-frame clip there is no bare canvas left to hit. A click
 * that reaches the canvas, or the stage around it, is therefore the
 * unambiguous one: nothing else can have meant it.
 */
function reachedPicture(event: ReactMouseEvent<HTMLDivElement>): boolean {
  return event.target === event.currentTarget || event.target instanceof HTMLCanvasElement;
}

function EditorInner() {
  const previewRef = useRef<PreviewHandle>(null);
  const stageWrapRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 });
  const [showExport, setShowExport] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [timelineCollapsed, setTimelineCollapsed] = useState(false);
  const [tab, setTab] = useState<EditorTab>("media");
  const engine = useTimelineEngine();
  const toast = useToast();
  const [pending, setPending] = useState<AutoSave | null>(() => readAutoSave());

  useAutoSave(pending === null);
  usePlayheadFollow(TIMELINE_SIDEBAR_WIDTH);
  useShortcuts(FPS);

  // Compute the largest 16:9 box that fits the stage wrapper.
  useEffect(() => {
    const el = stageWrapRef.current;
    if (!el) return;
    const compute = () => {
      const { width: W, height: H } = el.getBoundingClientRect();
      const byWidth = { w: W, h: W * (9 / 16) };
      const byHeight = { w: H * (16 / 9), h: H };
      setStageSize(byHeight.w <= W ? byHeight : byWidth);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Force Preview's ResizeObserver to fire after layout is fully painted.
  // The GpuRenderer reads container.clientWidth/clientHeight on first resize;
  // if that fires before flex has settled the container is 0px and the canvas
  // stays tiny. Dispatching a synthetic resize 100ms after mount re-triggers
  // the ResizeObserver with the real dimensions.
  useEffect(() => {
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event("resize"));
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const isPlaying = usePlaybackStore((state) => state.isPlaying);
  const loop = usePlaybackStore((state) => state.loop);
  const play = usePlaybackStore((state) => state.play);
  const pause = usePlaybackStore((state) => state.pause);
  const setCurrentFrame = usePlaybackStore((state) => state.setCurrentFrame);
  const toggleLoop = usePlaybackStore((state) => state.toggleLoop);
  const totalFrames = useTracksStore((state) => state.totalFrames);
  const look = usePreviewLook();
  const selected = useSelectedClip();
  const hasSelection = selected !== null;
  const previewFilter = [look.filterCss, look.effectCss, look.adjustCss].filter(Boolean).join(" ");

  const totalSeconds = framesToSeconds(totalFrames, FPS);

  const handleAssetActivate = useCallback(
    async (payload: AssetActivationPayload) => {
      if (payload.kind === "media-asset") {
        await insertMediaAsset(engine, payload.asset.id);
      }
    },
    [engine],
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

  /*
    Where the press started, and what was selected when it did.

    Recorded in the capture phase for two reasons: the SDK's clip boxes call
    stopPropagation on pointerdown, which would hide a bubbling handler, and
    they select the clip under the pointer there too. Selecting on pointerdown
    means that by the time the click arrives the selection already includes
    whatever was just clicked, so the click handler cannot tell "this clip was
    already selected" from "this click is what selected it" — only a snapshot
    taken before the SDK runs can.
  */
  const press = useRef<{ x: number; y: number; selectedId: string | null } | null>(null);

  function recordStagePress(event: ReactPointerEvent<HTMLDivElement>) {
    press.current =
      event.button === 0
        ? { x: event.clientX, y: event.clientY, selectedId: selected?.clip.id ?? null }
        : null;
  }

  /**
   * Clicking the picture works the transport, the way a player does — but the
   * picture is also the editing surface, so only a click with nothing else to
   * mean counts.
   *
   * Playing, the overlays are inert and a click can only mean "stop". Paused,
   * a click that lands on an overlay is doing that overlay's job: picking a
   * clip that was not selected, or reaching a text clip, whose second click
   * opens its editor. Those are left alone; a click on an already-selected
   * clip has no other job, so it runs the transport.
   */
  function toggleFromStage(event: ReactMouseEvent<HTMLDivElement>) {
    const start = press.current;
    press.current = null;
    if (!start || event.detail > 1) return;
    const drag =
      Math.abs(event.clientX - start.x) > CLICK_SLOP_PX ||
      Math.abs(event.clientY - start.y) > CLICK_SLOP_PX;
    if (drag) return;
    if (!isPlaying && !reachedPicture(event)) {
      // Nothing was selected when the press landed, so this click is what
      // picked the clip — that was its job.
      if (start.selectedId === null) return;
      // Text keeps its second click: double-clicking the box opens the editor.
      if (selected?.clip.type === "text") return;
    }
    if (isPlaying) pause();
    // The engine owns the clock while it runs, so the frame it stopped on is
    // the authoritative one. Re-asserting it bumps the store's frame epoch,
    // which is EditorProvider's cue to reconcile store and engine, leaving the
    // timeline needle on exactly the frame the preview is showing before
    // playback starts or resumes.
    seekFrame(playheadFrame());
    if (!isPlaying) play();
  }

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
        : lost === 1
          ? "Session restored — 1 clip needs its media re-imported"
          : `Session restored — ${lost} clips need their media re-imported`,
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

      {/* Main editor body — three columns: left panel | preview | inspector */}
      <div className="flex min-h-0 flex-1 overflow-hidden">

        {/* LEFT PANEL — fixed width, full content visible */}
        <div
          className="shrink-0 border-r border-[#34343a] bg-[#1a1a1e] overflow-y-auto overflow-x-hidden"
          style={{ width: 270, minWidth: 270 }}
        >
          <LeftPanel tab={tab} fps={FPS} onAssetActivate={handleAssetActivate} />
        </div>

        {/* CENTER — preview fills remaining space */}
        <section
          className="flex min-w-0 flex-1 flex-col bg-[#111113]"
        >
          {/* Preview area — takes all remaining vertical space */}
          <div className="relative min-h-0 flex-1" ref={stageWrapRef}>
            {/* 16:9 stage centred inside the available box */}
            <div
              className="capfree-stage overflow-hidden rounded-xl bg-black shadow-2xl"
              onPointerDownCapture={recordStagePress}
              onClick={toggleFromStage}
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                width: stageSize.w,
                height: stageSize.h,
                filter: previewFilter || undefined,
              }}
            >
              <Preview
                ref={previewRef}
                className="h-full w-full"
                style={{ display: "block", width: "100%", height: "100%" }}
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

          {/* Playback controls — centered below preview */}
          <div className="shrink-0 py-2">
            <PlaybackControls
              isPlaying={isPlaying}
              totalFrames={totalFrames}
              fps={FPS}
              loop={loop}
              onPlay={play}
              onPause={pause}
              onSeek={setCurrentFrame}
              onToggleLoop={toggleLoop}
              totalSeconds={totalSeconds}
            />
          </div>
        </section>

        {/* RIGHT PANEL — Inspector, fixed width, full content visible */}
        <div
          className="shrink-0 border-l border-[#34343a] bg-[#1a1a1e] overflow-y-auto overflow-x-hidden transition-[width] duration-200 ease-out"
          style={{ width: hasSelection ? 280 : 0, minWidth: hasSelection ? 280 : 0 }}
          aria-hidden={!hasSelection}
          inert={!hasSelection}
        >
          <InspectorPanel fps={FPS} />
        </div>
      </div>

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
        <div
          className="min-h-0 flex-1 overflow-hidden"
          data-capfree-timeline
          aria-hidden={timelineCollapsed}
          inert={timelineCollapsed}
        >
          <Timeline
            className="h-full"
            compactSidebar={false}
            sidebarWidth={TIMELINE_SIDEBAR_WIDTH}
          />
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
