import { NextResponse } from "next/server";
import { ffmpegVersion, hasFfprobe } from "@/lib/ffmpeg";
import { whisperLocalAvailable, openaiAvailable, PROVIDER, WHISPER_MODEL } from "@/lib/transcribe";
import type { HealthInfo } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const version = await ffmpegVersion();
  const ffprobe = await hasFfprobe();
  const whisperLocal = await whisperLocalAvailable();
  const openai = openaiAvailable();
  const transcribeReady = whisperLocal || openai;
  const info: HealthInfo = {
    ffmpeg: !!version,
    ffmpegVersion: version || undefined,
    ffprobe,
    whisperLocal,
    openai,
    transcribeReady,
    provider: PROVIDER,
    whisperModel: WHISPER_MODEL,
  };
  return NextResponse.json(info);
}
