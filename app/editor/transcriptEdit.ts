import type { TimelineEngine } from "@elah/editor";
import type { CaptionLine } from "./api";

export interface TranscriptWord {
  id: string;
  text: string;
  /** Seconds into the source media. Never reflowed — cuts move clips, not source. */
  start: number;
  end: number;
  cut: boolean;
}

export interface TranscriptLine {
  id: string;
  words: TranscriptWord[];
}

export interface TimeRange {
  start: number;
  end: number;
}

/** A word plus where it lands once earlier cuts are taken out. */
export interface ReflowedWord extends TranscriptWord {
  displayStart: number;
  displayEnd: number;
}

export function buildLines(captions: ReadonlyArray<CaptionLine>): TranscriptLine[] {
  return captions.map((line, lineIndex) => {
    const words =
      line.words && line.words.length > 0
        ? line.words
        : // No word timings: spread the line evenly so editing still works.
          line.text
            .split(/\s+/)
            .filter(Boolean)
            .map((word, index, all) => {
              const span = (line.end - line.start) / all.length;
              return { word, start: line.start + span * index, end: line.start + span * (index + 1) };
            });

    return {
      id: `l${lineIndex}`,
      words: words.map((word, wordIndex) => ({
        id: `l${lineIndex}w${wordIndex}`,
        text: word.word,
        start: word.start,
        end: word.end,
        cut: false,
      })),
    };
  });
}

export function allWords(lines: ReadonlyArray<TranscriptLine>): TranscriptWord[] {
  return lines.flatMap((line) => line.words);
}

/** Cut words merged into the fewest contiguous source ranges. */
export function cutRanges(lines: ReadonlyArray<TranscriptLine>): TimeRange[] {
  const cuts = allWords(lines)
    .filter((word) => word.cut)
    .sort((a, b) => a.start - b.start);

  const ranges: TimeRange[] = [];
  for (const word of cuts) {
    const last = ranges[ranges.length - 1];
    // Whisper leaves tiny gaps between words; anything under 120ms is one cut.
    if (last && word.start - last.end <= 0.12) last.end = Math.max(last.end, word.end);
    else ranges.push({ start: word.start, end: word.end });
  }
  return ranges;
}

/** Seconds of cut material lying before a point in the source. */
export function removedBefore(ranges: ReadonlyArray<TimeRange>, second: number): number {
  let removed = 0;
  for (const range of ranges) {
    if (range.end <= second) removed += range.end - range.start;
    else if (range.start < second) removed += second - range.start;
  }
  return removed;
}

/** Timestamps as they read after the cuts above are removed. */
export function reflow(lines: ReadonlyArray<TranscriptLine>): ReflowedWord[] {
  // Measured off the merged ranges, not the cut words: a range swallows the
  // tiny gaps between adjacent cut words, and those seconds leave too.
  const ranges = cutRanges(lines);
  const out: ReflowedWord[] = [];
  for (const word of allWords(lines).sort((a, b) => a.start - b.start)) {
    if (word.cut) continue;
    const removed = removedBefore(ranges, word.start);
    out.push({
      ...word,
      displayStart: Math.max(0, word.start - removed),
      displayEnd: Math.max(0, word.end - removed),
    });
  }
  return out;
}

function timestamp(seconds: number, separator: "," | "."): string {
  const safe = Math.max(0, seconds);
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);
  const ms = Math.round((safe - Math.floor(safe)) * 1000);
  const pad = (value: number, size = 2) => String(value).padStart(size, "0");
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)}${separator}${pad(ms, 3)}`;
}

/**
 * SRT for the surviving words, timed against media the cuts have already been
 * taken out of — which is what the burn-in endpoint receives. With nothing cut
 * these are the source timings unchanged.
 */
export function toSrt(lines: ReadonlyArray<TranscriptLine>): string {
  const timed = new Map(reflow(lines).map((word) => [word.id, word]));
  const blocks: string[] = [];
  for (const line of lines) {
    const kept = line.words.filter((word) => !word.cut && word.text.trim());
    if (kept.length === 0) continue;
    const times: ReflowedWord[] = [];
    for (const word of kept) {
      const at = timed.get(word.id);
      if (at) times.push(at);
    }
    if (times.length === 0) continue;
    const text = kept.map((word) => word.text.trim()).join(" ");
    const start = Math.min(...times.map((word) => word.displayStart));
    const end = Math.max(...times.map((word) => word.displayEnd));
    blocks.push(
      `${blocks.length + 1}\n${timestamp(start, ",")} --> ${timestamp(end, ",")}\n${text}\n`,
    );
  }
  return blocks.join("\n");
}

/**
 * Drops the cut words and rebases the rest onto media the cuts have already
 * been removed from, so the transcript keeps describing the clip once a
 * cut-aware burn has re-rendered it.
 */
export function applyCuts(lines: ReadonlyArray<TranscriptLine>): TranscriptLine[] {
  const timed = new Map(reflow(lines).map((word) => [word.id, word]));
  const out: TranscriptLine[] = [];
  for (const line of lines) {
    const words = line.words
      .filter((word) => !word.cut)
      .map((word) => {
        const at = timed.get(word.id);
        return at ? { ...word, start: at.displayStart, end: at.displayEnd } : word;
      });
    if (words.length > 0) out.push({ ...line, words });
  }
  return out;
}

export function toPlainText(lines: ReadonlyArray<TranscriptLine>): string {
  return lines
    .map((line) =>
      line.words
        .filter((word) => !word.cut && word.text.trim())
        .map((word) => word.text.trim())
        .join(" "),
    )
    .filter(Boolean)
    .join("\n");
}

/** Timeline frame holding a given second of the clip's source media. */
export function sourceSecondToFrame(
  clip: { startFrame: number; sourceStartFrame?: number },
  seconds: number,
  fps: number,
): number {
  const offset = clip.startFrame - (clip.sourceStartFrame ?? 0);
  return offset + Math.round(seconds * fps);
}

/** Splits around [from, to) on one track, drops the middle, closes the gap. */
function removeSpanOnTrack(
  engine: TimelineEngine,
  trackId: string,
  from: number,
  to: number,
): boolean {
  const host = engine
    .getClipsOnTrack(trackId)
    .find((clip) => from >= clip.startFrame && from < clip.startFrame + clip.durationFrames);
  if (!host) return false;

  const headSplit = engine.splitClip(host.id, trackId, from);
  if (!headSplit) return false;
  const tailId = headSplit[1];

  const tail = engine.findClip(tailId);
  if (!tail) return false;
  const tailEnd = tail.clip.startFrame + tail.clip.durationFrames;

  if (to >= tailEnd) {
    engine.removeClip(tailId, trackId);
  } else {
    const tailSplit = engine.splitClip(tailId, trackId, to);
    if (!tailSplit) return false;
    engine.removeClip(tailSplit[0], trackId);
  }

  engine.closeGap(trackId, from);
  return true;
}

/** Tracks that must stay in step: the clip's own, plus any linked audio. */
function linkedTrackIds(engine: TimelineEngine, clipId: string, trackId: string): string[] {
  const ids = new Set([trackId]);
  try {
    for (const linked of engine.getLinked(clipId)) {
      const found = engine.findClip(linked.id);
      if (found) ids.add(found.trackId);
    }
  } catch {
    /* Older engines may not link clips; the clip's own track is enough. */
  }
  return [...ids];
}

/**
 * Removes each source range from the timeline by splitting and deleting, the
 * same edit the Split and Delete buttons make. Ranges are applied last-first so
 * earlier frame numbers stay valid.
 */
export function cutRangesFromTimeline(
  engine: TimelineEngine,
  fps: number,
  located: { clip: { id: string; startFrame: number; sourceStartFrame?: number }; trackId: string },
  ranges: ReadonlyArray<TimeRange>,
): number {
  const tracks = linkedTrackIds(engine, located.clip.id, located.trackId);
  const ordered = [...ranges].sort((a, b) => b.start - a.start);
  let applied = 0;

  engine.batch(() => {
    for (const range of ordered) {
      const from = sourceSecondToFrame(located.clip, range.start, fps);
      const to = sourceSecondToFrame(located.clip, range.end, fps);
      if (to <= from) continue;
      let hit = false;
      for (const trackId of tracks) {
        if (removeSpanOnTrack(engine, trackId, from, to)) hit = true;
      }
      if (hit) applied += 1;
    }
  }, "Cut from transcript");

  return applied;
}
