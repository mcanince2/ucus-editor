import fs from "node:fs";
import { findUpload, thumbPath, contentTypeFor, fileToWebStream } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const url = new URL(req.url);
  const id = params.id;

  // Thumbnail variant.
  if (url.searchParams.get("thumb")) {
    const tp = thumbPath(id);
    if (!fs.existsSync(tp)) return new Response("Not found", { status: 404 });
    const buf = fs.readFileSync(tp);
    return new Response(buf, {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=31536000, immutable" },
    });
  }

  const file = findUpload(id);
  if (!file || !fs.existsSync(file)) return new Response("Not found", { status: 404 });

  const stat = fs.statSync(file);
  const total = stat.size;
  const type = contentTypeFor(file);
  const range = req.headers.get("range");

  if (range) {
    const match = range.match(/bytes=(\d*)-(\d*)/);
    let start = match && match[1] ? parseInt(match[1], 10) : 0;
    let end = match && match[2] ? parseInt(match[2], 10) : total - 1;
    if (isNaN(start)) start = 0;
    if (isNaN(end) || end >= total) end = total - 1;
    if (start > end || start >= total) {
      return new Response("Range Not Satisfiable", {
        status: 416,
        headers: { "Content-Range": `bytes */${total}` },
      });
    }
    const chunkSize = end - start + 1;
    return new Response(fileToWebStream(file, { start, end }) as any, {
      status: 206,
      headers: {
        "Content-Range": `bytes ${start}-${end}/${total}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(chunkSize),
        "Content-Type": type,
        "Cache-Control": "no-store",
      },
    });
  }

  return new Response(fileToWebStream(file) as any, {
    status: 200,
    headers: {
      "Content-Length": String(total),
      "Content-Type": type,
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
    },
  });
}
