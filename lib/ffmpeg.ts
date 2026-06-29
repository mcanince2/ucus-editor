import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { ProbeResult, AssetKind } from "./types";
import { ensureDirs, thumbPath } from "./storage";

// Resolve ffmpeg/ffprobe: explicit env path > bundled static binary on
// serverless (Vercel) > system binary on PATH (local / Docker). System FFmpeg
// is preferred locally because it's faster and fully-featured; the bundled
// static binaries exist so the app still renders on hosts without FFmpeg.
function staticBinary(mod: string, pick: (m: any) => string | null): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const m = require(mod);
    return pick(m);
  } catch {
    return null;
  }
}

const USE_STATIC = !!(process.env.VERCEL || process.env.FFMPEG_STATIC);

export const FFMPEG =
  process.env.FFMPEG_PATH ||
  (USE_STATIC ? staticBinary("ffmpeg-static", (m) => (typeof m === "string" ? m : m?.default)) : null) ||
  "ffmpeg";

export const FFPROBE =
  process.env.FFPROBE_PATH ||
  (USE_STATIC ? staticBinary("ffprobe-static", (m) => m?.path || m?.default?.path) : null) ||
  "ffprobe";

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Run a binary and collect output. Never throws on non-zero; returns code. */
export function run(bin: string, args: string[], opts: { input?: Buffer } = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", (err) => reject(err));
    child.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));
    if (opts.input) {
      child.stdin.write(opts.input);
      child.stdin.end();
    }
  });
}

/**
 * Run ffmpeg with -progress piped to stdout, reporting 0..1 fraction based on
 * the known total duration. onLine receives raw stderr lines for stage hints.
 */
export function runFfmpegProgress(
  args: string[],
  totalDuration: number,
  onProgress: (fraction: number) => void,
  onSpawn?: (child: ReturnType<typeof spawn>) => void
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const full = ["-y", "-progress", "pipe:1", "-nostats", ...args];
    const child = spawn(FFMPEG, full, { windowsHide: true });
    onSpawn?.(child);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      const text = d.toString();
      stdout += text;
      const m = text.match(/out_time_ms=(\d+)/g);
      if (m && totalDuration > 0) {
        const last = m[m.length - 1];
        const us = parseInt(last.split("=")[1], 10);
        const frac = Math.min(0.999, us / 1_000_000 / totalDuration);
        onProgress(frac);
      }
    });
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

export async function ffmpegVersion(): Promise<string | null> {
  try {
    const r = await run(FFMPEG, ["-version"]);
    if (r.code !== 0) return null;
    const line = r.stdout.split("\n")[0] || "";
    return line.replace("ffmpeg version", "").trim().split(" ")[0] || "ok";
  } catch {
    return null;
  }
}

export async function hasFfprobe(): Promise<boolean> {
  try {
    const r = await run(FFPROBE, ["-version"]);
    return r.code === 0;
  } catch {
    return false;
  }
}

function detectKind(ext: string): AssetKind {
  const e = ext.toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif"].includes(e)) return "image";
  if ([".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"].includes(e)) return "audio";
  return "video";
}

/** Probe a media file for duration, dimensions, fps and audio presence. */
export async function probe(file: string): Promise<ProbeResult> {
  const ext = path.extname(file);
  const kind = detectKind(ext);
  const r = await run(FFPROBE, [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-show_entries",
    "stream=codec_type,width,height,avg_frame_rate,r_frame_rate",
    "-of",
    "json",
    file,
  ]);
  let duration = 0;
  let width: number | undefined;
  let height: number | undefined;
  let fps: number | undefined;
  let hasAudio = false;
  try {
    const json = JSON.parse(r.stdout);
    duration = parseFloat(json?.format?.duration ?? "0") || 0;
    for (const s of json?.streams ?? []) {
      if (s.codec_type === "video" && width === undefined) {
        width = s.width;
        height = s.height;
        const fr = s.avg_frame_rate && s.avg_frame_rate !== "0/0" ? s.avg_frame_rate : s.r_frame_rate;
        if (fr && fr.includes("/")) {
          const [a, b] = fr.split("/").map(Number);
          if (b) fps = Math.round((a / b) * 100) / 100;
        }
      }
      if (s.codec_type === "audio") hasAudio = true;
    }
  } catch {}
  if (kind === "image") {
    duration = 0;
    hasAudio = false;
  }
  return { duration, width, height, fps, hasAudio, kind };
}

/** Generate a JPEG thumbnail at ~1s (or middle) of a video. */
export async function makeThumbnail(file: string, id: string, atSeconds = 1): Promise<string | null> {
  ensureDirs();
  const out = thumbPath(id);
  const r = await run(FFMPEG, [
    "-y",
    "-ss",
    String(atSeconds),
    "-i",
    file,
    "-frames:v",
    "1",
    "-vf",
    "scale=320:-2:flags=bilinear",
    "-q:v",
    "4",
    out,
  ]);
  if (r.code === 0 && fs.existsSync(out)) return out;
  // retry at 0s for very short clips
  const r2 = await run(FFMPEG, ["-y", "-i", file, "-frames:v", "1", "-vf", "scale=320:-2", "-q:v", "4", out]);
  return r2.code === 0 && fs.existsSync(out) ? out : null;
}

/**
 * Detect silent regions using ffmpeg's silencedetect filter.
 * Returns ranges in source-time seconds.
 */
export async function detectSilence(
  file: string,
  noiseDb: number,
  minSilence: number
): Promise<{ start: number; end: number }[]> {
  const r = await run(FFMPEG, [
    "-i",
    file,
    "-af",
    `silencedetect=noise=${noiseDb}dB:d=${minSilence}`,
    "-f",
    "null",
    "-",
  ]);
  const text = r.stderr;
  const ranges: { start: number; end: number }[] = [];
  let pendingStart: number | null = null;
  for (const line of text.split("\n")) {
    const sm = line.match(/silence_start:\s*(-?[\d.]+)/);
    const em = line.match(/silence_end:\s*([\d.]+)/);
    if (sm) pendingStart = Math.max(0, parseFloat(sm[1]));
    if (em && pendingStart !== null) {
      ranges.push({ start: pendingStart, end: parseFloat(em[1]) });
      pendingStart = null;
    }
  }
  return ranges;
}

/**
 * Produce a coarse normalized waveform (peaks 0..1) by extracting raw PCM
 * and bucketing. Returns ~`buckets` values. Cheap and good enough for a track.
 */
export async function extractWaveform(file: string, duration: number, buckets = 400): Promise<number[]> {
  // Downsample to mono 8kHz s16le, read from stdout.
  return new Promise((resolve) => {
    const args = ["-i", file, "-ac", "1", "-ar", "8000", "-f", "s16le", "-"];
    const child = spawn(FFMPEG, args, { windowsHide: true });
    const chunks: Buffer[] = [];
    child.stdout.on("data", (d) => chunks.push(d));
    child.on("error", () => resolve([]));
    child.on("close", () => {
      try {
        const buf = Buffer.concat(chunks);
        const samples = buf.length / 2;
        if (samples <= 0) return resolve([]);
        const perBucket = Math.max(1, Math.floor(samples / buckets));
        const peaks: number[] = [];
        let max = 0;
        for (let b = 0; b < buckets; b++) {
          let peak = 0;
          const startSample = b * perBucket;
          for (let i = 0; i < perBucket; i++) {
            const idx = (startSample + i) * 2;
            if (idx + 1 >= buf.length) break;
            const v = Math.abs(buf.readInt16LE(idx));
            if (v > peak) peak = v;
          }
          peaks.push(peak);
          if (peak > max) max = peak;
        }
        const norm = max > 0 ? peaks.map((p) => Math.round((p / max) * 1000) / 1000) : peaks;
        resolve(norm);
      } catch {
        resolve([]);
      }
    });
  });
}
