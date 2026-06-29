import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { uploadPath } from "@/lib/storage";
import { probe } from "@/lib/ffmpeg";
import type { MediaAsset } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Seeds the default background music (shipped in /public) as an uploaded asset.
const MUSIC_ID = "ucusmusic";

export async function GET() {
  const src = path.join(process.cwd(), "public", "brand-music.mp3");
  if (!fs.existsSync(src)) {
    return NextResponse.json({ error: "Varsayılan müzik bulunamadı" }, { status: 404 });
  }
  const dest = uploadPath(MUSIC_ID, "mp3");
  if (!fs.existsSync(dest)) fs.copyFileSync(src, dest);
  const meta = await probe(dest);
  const stat = fs.statSync(dest);
  const asset: MediaAsset = {
    id: MUSIC_ID,
    name: "Consumerism Simplified",
    kind: "audio",
    url: `/api/media/${MUSIC_ID}`,
    size: stat.size,
    duration: meta.duration,
    hasAudio: true,
    status: "ready",
  };
  return NextResponse.json(asset);
}
