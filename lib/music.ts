import fs from "node:fs";
import path from "node:path";
import { MUSIC_DIR, ensureDirs } from "./storage";
import { run, FFMPEG } from "./ffmpeg";
import type { BuiltinTrack } from "./types";

export const MUSIC_DURATION = 60;

export const TRACKS: { id: string; name: string; mood: string; freqs: number[]; trem: number; echo: number }[] = [
  { id: "calm", name: "Sakin Akış", mood: "Yumuşak / huzurlu", freqs: [220, 277.2, 329.6], trem: 3, echo: 0.32 },
  { id: "uplift", name: "Umut", mood: "Pozitif / aydınlık", freqs: [261.6, 329.6, 392.0], trem: 4, echo: 0.28 },
  { id: "lofi", name: "Lo-Fi Sıcaklık", mood: "Sıcak / nostaljik", freqs: [174.6, 220.0, 261.6], trem: 2.5, echo: 0.45 },
  { id: "energetic", name: "Enerji", mood: "Tempolu / canlı", freqs: [293.7, 370.0, 440.0], trem: 7, echo: 0.2 },
];

export function trackPath(id: string): string {
  return path.join(MUSIC_DIR, `${id}.mp3`);
}

export async function generateTrack(id: string): Promise<string | null> {
  const t = TRACKS.find((x) => x.id === id);
  if (!t) return null;
  ensureDirs();
  const out = trackPath(t.id);
  if (fs.existsSync(out)) return out;
  const inputs: string[] = [];
  const labels: string[] = [];
  t.freqs.forEach((f, i) => {
    inputs.push("-f", "lavfi", "-i", `sine=frequency=${f}:duration=${MUSIC_DURATION}`);
    labels.push(`[${i}]`);
  });
  const fc =
    `${labels.join("")}amix=inputs=${t.freqs.length},` +
    `tremolo=f=${t.trem}:d=0.35,aecho=0.8:0.7:${Math.round(t.echo * 200)}:${t.echo},` +
    `lowpass=f=2400,highpass=f=80,volume=2.4,` +
    `afade=t=in:d=2,afade=t=out:st=${MUSIC_DURATION - 2}:d=2`;
  const r = await run(FFMPEG, ["-y", ...inputs, "-filter_complex", fc, "-ar", "44100", "-b:a", "160k", out]);
  return r.code === 0 && fs.existsSync(out) ? out : null;
}

export async function ensureAllTracks(): Promise<void> {
  await Promise.all(TRACKS.map((t) => generateTrack(t.id)));
}

export function listTracks(): BuiltinTrack[] {
  return TRACKS.map((t) => ({
    id: t.id,
    name: t.name,
    mood: t.mood,
    url: `/api/music?file=${t.id}`,
    duration: MUSIC_DURATION,
  }));
}
