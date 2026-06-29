import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { uploadPath } from "@/lib/storage";
import { probe, makeThumbnail } from "@/lib/ffmpeg";
import type { MediaAsset } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id") || "";
  const name = url.searchParams.get("name") || "media";
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    return NextResponse.json({ error: "Geçersiz id" }, { status: 400 });
  }
  if (!req.body) {
    return NextResponse.json({ error: "Boş gövde" }, { status: 400 });
  }

  const ext = (path.extname(name) || ".bin").replace(".", "");
  const dest = uploadPath(id, ext);

  try {
    const nodeStream = Readable.fromWeb(req.body as any);
    await pipeline(nodeStream, fs.createWriteStream(dest));
  } catch (e: any) {
    return NextResponse.json({ error: "Yükleme yazılamadı: " + e.message }, { status: 500 });
  }

  const stat = fs.statSync(dest);
  const meta = await probe(dest);

  let thumbnail: string | undefined;
  if (meta.kind === "video") {
    const at = Math.min(1, Math.max(0.1, meta.duration / 2));
    const thumb = await makeThumbnail(dest, id, at);
    if (thumb) thumbnail = `/api/media/${id}?thumb=1&v=${Date.now()}`;
  }

  const asset: MediaAsset = {
    id,
    name,
    kind: meta.kind,
    url: `/api/media/${id}`,
    size: stat.size,
    duration: meta.duration,
    width: meta.width,
    height: meta.height,
    fps: meta.fps,
    hasAudio: meta.hasAudio,
    thumbnail,
    status: "ready",
  };

  return NextResponse.json(asset);
}
