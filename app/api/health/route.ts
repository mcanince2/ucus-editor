import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { ffmpegVersion, hasFfprobe, run, FFMPEG } from "@/lib/ffmpeg";
import { whisperLocalAvailable, openaiAvailable, PROVIDER, WHISPER_MODEL } from "@/lib/transcribe";
import type { HealthInfo } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ffmpeg built with the arnndn (RNNoise) filter + our model file present? */
async function noiseSuppressionAvailable(): Promise<boolean> {
  const model = process.env.RNNOISE_MODEL || path.join(process.cwd(), "models", "rnnoise", "sh.rnnn");
  if (!fs.existsSync(model)) return false;
  try {
    const r = await run(FFMPEG, ["-hide_banner", "-filters"]);
    return r.code === 0 && /\barnndn\b/.test(r.stdout);
  } catch {
    return false;
  }
}

export async function GET() {
  const version = await ffmpegVersion();
  const ffprobe = await hasFfprobe();
  const whisperLocal = await whisperLocalAvailable();
  const openai = openaiAvailable();
  const transcribeReady = whisperLocal || openai;
  const noiseSuppression = version ? await noiseSuppressionAvailable() : false;
  const info: HealthInfo = {
    ffmpeg: !!version,
    ffmpegVersion: version || undefined,
    ffprobe,
    whisperLocal,
    openai,
    transcribeReady,
    provider: PROVIDER,
    whisperModel: WHISPER_MODEL,
    noiseSuppression,
  };
  return NextResponse.json(info);
}
