"use client";

import type { Clip, TimelineEngine } from "@elah/editor";

/** A stretch of the *source* media, in seconds, as the API reports it. */
export interface SourceRange {
  start: number;
  end: number;
}

export interface CutResult {
  /** How many separate stretches came out. */
  cuts: number;
  framesRemoved: number;
  secondsRemoved: number;
  /** How many clips were cut in step — the picture plus any audio twin. */
  tracks: number;
}

export interface SnapResult {
  /** Cut points that moved onto a beat. */
  snapped: number;
  /** Cut points that were there to move. */
  candidates: number;
}

export type Located = { clip: Clip; trackId: string };

/**
 * The clip, plus the copies of it that have to be cut in step.
 *
 * Adding a video as "Video + Audio" puts the picture on a video track and its
 * sound on an audio track as two independent clips — the SDK does not link
 * them. Cutting only the one the detector was run against would leave the
 * sound running at full length against a shortened picture, so the twin is
 * found here by what makes it a twin: the same asset, showing the same source
 * window, over the same frames.
 */
export function withCompanions(engine: TimelineEngine, located: Located): Located[] {
  const { clip } = located;
  const targets: Located[] = [located];
  if (!clip.assetId) return targets;

  for (const track of engine.getProject().tracks) {
    if (track.id === located.trackId) continue;
    for (const other of engine.getClipsOnTrack(track.id)) {
      if (
        other.assetId === clip.assetId &&
        other.startFrame === clip.startFrame &&
        other.durationFrames === clip.durationFrames &&
        (other.sourceStartFrame ?? 0) === (clip.sourceStartFrame ?? 0)
      ) {
        targets.push({ clip: other, trackId: track.id });
      }
    }
  }
  return targets;
}

/** The clip occupying a frame on a track, if any. */
function clipAt(engine: TimelineEngine, trackId: string, frame: number): Clip | undefined {
  return engine
    .getClipsOnTrack(trackId)
    .find((clip) => clip.startFrame <= frame && frame < clip.startFrame + clip.durationFrames);
}

/** Clips in play order. getClipsOnTrack makes no promise about order. */
function inOrder(engine: TimelineEngine, trackId: string): Clip[] {
  return [...engine.getClipsOnTrack(trackId)].sort((a, b) => a.startFrame - b.startFrame);
}

/**
 * Everything from `frame` on moves by `delta`, closing the gap a cut leaves.
 *
 * The engine's own `closeGap` would do this, but it works the gap's extent out
 * for itself, and for a cut starting on a clip's very first frame it reaches
 * back past the clip to whatever ended before it. Naming the frame avoids that.
 */
function ripple(engine: TimelineEngine, trackId: string, frame: number, delta: number): void {
  if (delta === 0) return;
  const moves = inOrder(engine, trackId)
    .filter((clip) => clip.startFrame >= frame)
    .map((clip) => ({ clipId: clip.id, trackId, delta }));
  if (moves.length > 0) engine.shiftClips(moves);
}

/**
 * Cuts stretches of source media out of a clip and closes the gaps.
 *
 * This is the timeline-side answer to the API's detectors: they report where
 * the silence or the filler words sit in the source, and this takes those
 * stretches out of the edit. Nothing is re-encoded and nothing is uploaded
 * back, so the cut is instant, frame-exact, and undone by one Ctrl+Z — where
 * re-rendering the file server-side replaces the media and throws away the
 * clip's trim handles with it.
 *
 * The whole run is one batch, so it is also one history entry, and a failure
 * part-way leaves the timeline as it was rather than half cut.
 */
export function cutSourceRanges(
  engine: TimelineEngine,
  targets: ReadonlyArray<Located>,
  ranges: ReadonlyArray<SourceRange>,
  fps: number,
  description: string,
): CutResult {
  if (targets.length === 0) return { cuts: 0, framesRemoved: 0, secondsRemoved: 0, tracks: 0 };

  let first: { cuts: number; framesRemoved: number } | null = null;
  // One batch across every target: the picture and its sound have to come out
  // of this either both cut or both untouched, under one history entry.
  engine.batch(() => {
    for (const target of targets) {
      const result = planAndCut(engine, target, ranges, fps);
      if (!first) first = result;
    }
  }, description);

  const outcome = first ?? { cuts: 0, framesRemoved: 0 };
  return {
    cuts: outcome.cuts,
    framesRemoved: outcome.framesRemoved,
    secondsRemoved: outcome.framesRemoved / fps,
    tracks: targets.length,
  };
}

/** One clip's worth of cutting. Runs inside the caller's batch. */
function planAndCut(
  engine: TimelineEngine,
  located: Located,
  ranges: ReadonlyArray<SourceRange>,
  fps: number,
): { cuts: number; framesRemoved: number } {
  const { clip, trackId } = located;
  // Speed is stored signed; reversed or not, the source advances by |speed|
  // frames of media per timeline frame.
  const speed = Math.abs(clip.speed ?? 1) || 1;
  const sourceStart = clip.sourceStartFrame ?? 0;
  const clipStart = clip.startFrame;
  const clipEnd = clip.startFrame + clip.durationFrames;

  /** The timeline frame now showing source second `t` of this clip. */
  const toTimeline = (t: number) => clipStart + Math.round((t * fps - sourceStart) / speed);

  const spans = ranges
    .map((range) => {
      const from = toTimeline(Math.min(range.start, range.end));
      const to = toTimeline(Math.max(range.start, range.end));
      return {
        from: Math.max(clipStart, Math.min(clipEnd, from)),
        to: Math.max(clipStart, Math.min(clipEnd, to)),
      };
    })
    // Under a frame long once rounded, or entirely outside the clip's trim:
    // there is nothing to take out.
    .filter((span) => span.to - span.from >= 1)
    .sort((a, b) => a.from - b.from);

  // Merge what overlaps or touches. Two cuts meeting at a frame would leave a
  // zero-length piece between them, which cannot be split off.
  const merged: Array<{ from: number; to: number }> = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (last && span.from <= last.to) last.to = Math.max(last.to, span.to);
    else merged.push({ ...span });
  }
  if (merged.length === 0) return { cuts: 0, framesRemoved: 0 };

  const total = merged.reduce((sum, span) => sum + (span.to - span.from), 0);
  if (total >= clip.durationFrames) {
    // Thrown inside the caller's batch, which rolls the whole run back — so a
    // companion already cut does not survive this.
    throw new Error("That would cut the whole clip away — nothing would be left.");
  }

  let framesRemoved = 0;
  let cuts = 0;

  {
    // Back to front: a cut pulls everything after it left, so a span's frames
    // hold only while no cut ahead of it has happened yet.
    for (const span of [...merged].reverse()) {
      const host = clipAt(engine, trackId, span.from);
      if (!host) continue;
      const hostEnd = host.startFrame + host.durationFrames;
      const from = Math.max(span.from, host.startFrame);
      const to = Math.min(span.to, hostEnd);
      if (to - from < 1) continue;

      // Split the doomed stretch free of whatever survives either side of it.
      // A split exactly on a clip edge is refused, hence the guards — on an
      // edge there is nothing on that side to keep.
      let doomed = host.id;
      if (to < hostEnd) {
        const halves = engine.splitClip(doomed, trackId, to);
        if (!halves) continue;
        doomed = halves[0];
      }
      if (from > host.startFrame) {
        const halves = engine.splitClip(doomed, trackId, from);
        if (!halves) continue;
        doomed = halves[1];
      }

      engine.removeClip(doomed, trackId);
      ripple(engine, trackId, to, -(to - from));
      framesRemoved += to - from;
      cuts += 1;
    }
  }

  return { cuts, framesRemoved };
}

/**
 * Puts the cuts between neighbouring clips on the beat.
 *
 * Shortening is the only move available. An ordinary media clip's source
 * window is exactly the material it already shows — splitting one sets each
 * piece's `sourceDurationFrames` to what that piece consumes, and with no
 * `assetFrames` the engine reads that as all the source there is — so
 * `trimClip` clamps any attempt to lengthen a clip. A rolling edit, where one
 * side gives up what the other takes, therefore cannot be expressed at all:
 * asking for it would silently stretch one clip's tail and leave a hole in the
 * run.
 *
 * So each clip is trimmed back to the last beat it can reach and the rest of
 * the run moves up to meet it. That is how a montage gets cut to the beat: the
 * run comes out shorter, by at most `maxTrimFrames` per clip, with every cut
 * landing on a beat.
 */
export function snapCutsToBeats(
  engine: TimelineEngine,
  trackIds: ReadonlyArray<string>,
  beatSeconds: ReadonlyArray<number>,
  fps: number,
  maxTrimFrames: number,
): SnapResult {
  const beats = [...new Set(beatSeconds.map((t) => Math.round(t * fps)))]
    .filter((frame) => frame > 0)
    .sort((a, b) => a - b);
  if (beats.length === 0) return { snapped: 0, candidates: 0 };

  // Every track gets the same walk. Where a video and its audio twin are both
  // listed their clips line up frame for frame, so the same beats move the
  // same cuts and the two stay in step — trimming the picture alone would
  // leave the sound running past it.
  let first: SnapResult | null = null;
  engine.batch(() => {
    for (const trackId of trackIds) {
      const result = snapOneTrack(engine, trackId, beats, maxTrimFrames);
      if (!first) first = result;
    }
  }, "Snap cuts to beats");
  return first ?? { snapped: 0, candidates: 0 };
}

/** One track's walk. Runs inside the caller's batch. */
function snapOneTrack(
  engine: TimelineEngine,
  trackId: string,
  beats: ReadonlyArray<number>,
  maxTrimFrames: number,
): SnapResult {

  /** The last beat a clip running from `floor` could end on, at or before `end`. */
  const beatFor = (end: number, floor: number): number | null => {
    let found: number | null = null;
    for (const beat of beats) {
      if (beat > end) break;
      if (beat >= floor) found = beat;
    }
    return found;
  };

  let snapped = 0;
  let candidates = 0;

  {
    // Positions shift as the run is trimmed, so the track is re-read each
    // time rather than walked from one stale snapshot.
    for (let index = 0; ; index += 1) {
      const run = inOrder(engine, trackId);
      const clip = run[index];
      const next = run[index + 1];
      if (!clip || !next) break;

      const end = clip.startFrame + clip.durationFrames;
      // A gap is a deliberate hole in the edit, not a cut point.
      if (next.startFrame !== end) continue;
      candidates += 1;

      const beat = beatFor(end, clip.startFrame + 1);
      if (beat === null || end - beat > maxTrimFrames) continue;
      if (beat === end) {
        snapped += 1;
        continue;
      }

      engine.trimClip(clip.id, trackId, clip.startFrame, beat - clip.startFrame);
      // The trim clamps to the material the clip has, so whether the cut
      // landed is a question for the engine, not for the arithmetic.
      const trimmed = engine.findClip(clip.id)?.clip;
      if (!trimmed || trimmed.startFrame + trimmed.durationFrames !== beat) continue;
      ripple(engine, trackId, end, -(end - beat));
      snapped += 1;
    }
  }

  return { snapped, candidates };
}
