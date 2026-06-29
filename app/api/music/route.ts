import { NextResponse } from "next/server";
import fs from "node:fs";
import { contentTypeFor } from "@/lib/storage";
import { generateTrack, trackPath, ensureAllTracks, listTracks } from "@/lib/music";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const file = url.searchParams.get("file");

  if (file) {
    await generateTrack(file);
    const p = trackPath(file);
    if (!fs.existsSync(p)) return new Response("Not found", { status: 404 });
    const buf = fs.readFileSync(p);
    return new Response(buf, {
      headers: { "Content-Type": contentTypeFor(p), "Accept-Ranges": "bytes", "Cache-Control": "no-store" },
    });
  }

  await ensureAllTracks();
  return NextResponse.json(listTracks());
}
