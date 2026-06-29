import { NextResponse } from "next/server";
import { findUpload } from "@/lib/storage";
import { detectSilence, extractWaveform, probe } from "@/lib/ffmpeg";
import { SILENCE_PROFILES } from "@/lib/constants";
import type { SilenceResult, SilenceSensitivity } from "@/lib/types";
import fs from "node:fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const id: string = body?.id;
  const sensitivity: SilenceSensitivity = body?.sensitivity || "balanced";
  if (!id) return NextResponse.json({ error: "id gerekli" }, { status: 400 });

  const file = findUpload(id);
  if (!file || !fs.existsSync(file)) return NextResponse.json({ error: "Dosya yok" }, { status: 404 });

  const profile = SILENCE_PROFILES[sensitivity] || SILENCE_PROFILES.balanced;
  const meta = await probe(file);

  let silences: { start: number; end: number }[] = [];
  if (meta.hasAudio) {
    silences = await detectSilence(file, profile.noiseDb, profile.minSilence);
  }
  const waveform = meta.hasAudio ? await extractWaveform(file, meta.duration, 600) : [];

  const result: SilenceResult = {
    silences,
    waveform,
    duration: meta.duration,
  };
  return NextResponse.json(result);
}
