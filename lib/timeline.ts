import type {
  Clip,
  PlacedClip,
  Timeline,
  MediaAsset,
  TimeRange,
  AutoEditSettings,
  SubtitleCue,
  WordTiming,
} from "./types";
import { SILENCE_PROFILES } from "./constants";
import { clamp, uid } from "./format";

/** Duration of a clip on the timeline, accounting for speed. */
export function clipDuration(clip: Clip): number {
  return Math.max(0, (clip.out - clip.in) / (clip.speed || 1));
}

/** Compute absolute timeline positions for an ordered clip list. */
export function buildTimeline(clips: Clip[]): Timeline {
  let t = 0;
  const placed: PlacedClip[] = clips.map((clip, index) => {
    const duration = clipDuration(clip);
    const p: PlacedClip = { ...clip, start: t, duration, end: t + duration, index };
    t += duration;
    return p;
  });
  return { clips: placed, duration: t };
}

/** Which placed clip is active at a given timeline time. */
export function clipAtTime(timeline: Timeline, time: number): PlacedClip | null {
  for (const c of timeline.clips) {
    if (time >= c.start && time < c.end) return c;
  }
  // clamp to last clip at the very end
  if (timeline.clips.length && time >= timeline.duration) {
    return timeline.clips[timeline.clips.length - 1];
  }
  return timeline.clips[0] ?? null;
}

/** Map a timeline time to the underlying source time for a clip. */
export function timelineToSource(clip: PlacedClip, timelineTime: number): number {
  const local = clamp(timelineTime - clip.start, 0, clip.duration);
  return clip.in + local * (clip.speed || 1);
}

/** Map a source time inside a clip to timeline time. */
export function sourceToTimeline(clip: PlacedClip, sourceTime: number): number {
  const local = (sourceTime - clip.in) / (clip.speed || 1);
  return clip.start + clamp(local, 0, clip.duration);
}

/** Split a clip at a given timeline time → returns a new clips array. */
export function splitClips(clips: Clip[], clipId: string, sourceTime: number): Clip[] {
  const out: Clip[] = [];
  for (const c of clips) {
    if (c.id === clipId && sourceTime > c.in + 0.05 && sourceTime < c.out - 0.05) {
      out.push({ ...c, out: sourceTime });
      out.push({ ...c, id: uid("clip_"), in: sourceTime, transition: "none" });
    } else {
      out.push(c);
    }
  }
  return out;
}

/** Move an array item from one index to another (immutable). */
export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  const copy = arr.slice();
  const [item] = copy.splice(from, 1);
  copy.splice(clamp(to, 0, copy.length), 0, item);
  return copy;
}

/**
 * Given an asset's detected silences, produce the speech segments to KEEP.
 * Returns a list of {in,out} source ranges with padding applied and tiny
 * fragments dropped, so the cut never feels abrupt.
 */
export function keepRangesFromSilences(
  duration: number,
  silences: TimeRange[],
  settings: AutoEditSettings
): TimeRange[] {
  if (!settings.removeSilence || !silences.length) return [{ start: 0, end: duration }];

  // Invert silences → speech ranges.
  const sorted = [...silences].sort((a, b) => a.start - b.start);
  const speech: TimeRange[] = [];
  let cursor = 0;
  for (const s of sorted) {
    const start = clamp(s.start, 0, duration);
    const end = clamp(s.end, 0, duration);
    if (start > cursor) speech.push({ start: cursor, end: start });
    cursor = Math.max(cursor, end);
  }
  if (cursor < duration) speech.push({ start: cursor, end: duration });

  // Apply padding so we don't clip the first/last syllable.
  const pad = settings.padding;
  const padded = speech.map((r) => ({
    start: clamp(r.start - pad, 0, duration),
    end: clamp(r.end + pad, 0, duration),
  }));

  // Merge overlaps created by padding and drop fragments that are too short.
  const merged: TimeRange[] = [];
  for (const r of padded) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end + 0.05) {
      last.end = Math.max(last.end, r.end);
    } else {
      merged.push({ ...r });
    }
  }
  return merged.filter((r) => r.end - r.start >= settings.minKeep);
}

/**
 * Turn a set of assets into an ordered clip list, removing silence per asset.
 * Each kept speech range becomes its own clip so the user can still tweak them.
 */
export function buildClipsFromAssets(
  assets: MediaAsset[],
  settings: AutoEditSettings,
  addTransitions: boolean
): Clip[] {
  const clips: Clip[] = [];
  // Use the per-sensitivity padding (smaller pad = more aggressive removal).
  const profile = SILENCE_PROFILES[settings.sensitivity];
  const effSettings: AutoEditSettings = { ...settings, padding: profile?.pad ?? settings.padding };
  for (const asset of assets) {
    if (asset.kind !== "video") continue;
    const ranges = asset.silences && asset.analyzed
      ? keepRangesFromSilences(asset.duration, asset.silences, effSettings)
      : [{ start: 0, end: asset.duration }];
    ranges.forEach((r, i) => {
      clips.push({
        id: uid("clip_"),
        assetId: asset.id,
        in: r.start,
        out: r.end,
        speed: 1,
        muted: false,
        transition: addTransitions && clips.length > 0 && i === 0 ? "fade" : "none",
      });
    });
  }
  return clips;
}

export function silenceParamsFor(settings: AutoEditSettings) {
  return SILENCE_PROFILES[settings.sensitivity];
}

/**
 * Map transcript cues (in an asset's SOURCE time) onto the cut timeline.
 * Cues that fall entirely inside removed silence are dropped; cues that
 * partially overlap a clip are clamped to the kept region.
 */
export function mapAssetCuesToTimeline(
  assetId: string,
  cues: { start: number; end: number; text: string; words?: WordTiming[] }[],
  placed: PlacedClip[]
): SubtitleCue[] {
  const clips = placed.filter((c) => c.assetId === assetId);
  if (!clips.length) return [];

  const coveringClip = (srcTime: number): PlacedClip | null => {
    for (const c of clips) if (srcTime >= c.in && srcTime < c.out) return c;
    return null;
  };

  const out: SubtitleCue[] = [];
  let n = 0;
  for (const cue of cues) {
    const mid = (cue.start + cue.end) / 2;
    const startClip = coveringClip(cue.start) || coveringClip(mid) || coveringClip(cue.end);
    if (!startClip) continue; // cue lives in removed silence
    const endClip = coveringClip(cue.end) || startClip;

    const tlStart = sourceToTimeline(startClip, clamp(cue.start, startClip.in, startClip.out));
    let tlEnd = sourceToTimeline(endClip, clamp(cue.end, endClip.in, endClip.out));
    if (tlEnd <= tlStart) tlEnd = tlStart + 0.5;

    let words: WordTiming[] | undefined;
    if (cue.words?.length) {
      words = [];
      for (const w of cue.words) {
        const wc = coveringClip((w.start + w.end) / 2) || coveringClip(w.start);
        if (!wc) continue;
        const ws = sourceToTimeline(wc, clamp(w.start, wc.in, wc.out));
        const we = sourceToTimeline(wc, clamp(w.end, wc.in, wc.out));
        words.push({ word: w.word, start: ws, end: Math.max(ws + 0.05, we) });
      }
      if (!words.length) words = undefined;
    }

    out.push({
      id: `cue_${assetId.slice(0, 4)}_${n++}_${Math.round(tlStart * 100)}`,
      start: tlStart,
      end: tlEnd,
      text: cue.text,
      words,
    });
  }
  return out;
}

/** Total seconds removed vs. original, for the "X sn kırpıldı" badge. */
export function computeTrimStats(assets: MediaAsset[], clips: Clip[]) {
  const original = assets.filter((a) => a.kind === "video").reduce((s, a) => s + a.duration, 0);
  const kept = clips.reduce((s, c) => s + clipDuration(c), 0);
  return { original, kept, removed: Math.max(0, original - kept) };
}
