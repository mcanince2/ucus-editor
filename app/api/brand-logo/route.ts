import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { uploadPath } from "@/lib/storage";
import { probe } from "@/lib/ffmpeg";
import type { MediaAsset } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Seeds the Uçuş Saati brand logo (shipped in /public) as an uploaded asset so
// it can be used as the default video overlay and resolved at export time.
const BRAND_ID = "ucusbrand";

export async function GET() {
  const src = path.join(process.cwd(), "public", "brand-logo.png");
  if (!fs.existsSync(src)) {
    return NextResponse.json({ error: "Marka logosu bulunamadı" }, { status: 404 });
  }
  const dest = uploadPath(BRAND_ID, "png");
  if (!fs.existsSync(dest)) {
    fs.copyFileSync(src, dest);
  }
  const meta = await probe(dest);
  const stat = fs.statSync(dest);
  const asset: MediaAsset = {
    id: BRAND_ID,
    name: "Uçuş Saati Logo",
    kind: "image",
    url: `/api/media/${BRAND_ID}`,
    size: stat.size,
    duration: 0,
    width: meta.width,
    height: meta.height,
    hasAudio: false,
    status: "ready",
  };
  return NextResponse.json(asset);
}
