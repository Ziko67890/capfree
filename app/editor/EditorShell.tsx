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
import { consumeSticker } from "./stickerDrag";
import { useAutoSave } from "./useAutoSave";
import { useShortcuts } from "./useShortcuts";
import { RestoreBanner } from "./components/RestoreBanner";
import { ExportModal } from "./components/ExportModal";
import { InspectorPanel } from "./components/InspectorPanel";
import { LeftPanel } from "./components/LeftPanel";
import { PlaybackControls } from "./components/PlaybackControls";
import { TimelineBar } from "./components/TimelineBar";
import { ToolBar, type EditorTab } from "./components/ToolBar";
import { TopBar } from "./components/TopBar";
import { PreviewLookProvider, usePreviewLook } from "./previewLook";
import { ToastProvider, useToast } from "./components/toast";

const FPS = 30;

function EditorInner() {
  const previewRef = useRef<PreviewHandle>(null);
  const [showExport, setShowExport] = useState(false);
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
      <TopBar onExport={() => setShowExport(true)} />
      {pending && (
        <RestoreBanner save={pending} onRestore={restoreSession} onDiscard={discardSession} />
      )}
      <ToolBar tab={tab} onTab={setTab} />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <LeftPanel tab={tab} fps={FPS} onAssetActivate={handleAssetActivate} />

        <section className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3 bg-[#1a1a1e] px-4 py-4">
          <div
            className="relative w-full overflow-hidden rounded-lg bg-black shadow-2xl"
            style={{ aspectRatio: "16/9", maxHeight: "calc(100% - 60px)", filter: previewFilter || undefined }}
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

        <InspectorPanel fps={FPS} />
      </div>

      <div className="flex shrink-0 flex-col border-t border-[#34343a] bg-[#1a1a1e]" style={{ height: 252 }}>
        <TimelineBar fps={FPS} />
        <div className="min-h-0 flex-1" data-capfree-timeline>
          <Timeline className="h-full" compactSidebar />
        </div>
      </div>

      {showExport && <ExportModal onClose={() => setShowExport(false)} />}
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
