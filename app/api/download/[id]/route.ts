import fs from "node:fs";
import path from "node:path";
import { EXPORT_DIR, fileToWebStream } from "@/lib/storage";
import { getJob } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const id = params.id;
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return new Response("Bad id", { status: 400 });
  const file = path.join(EXPORT_DIR, `${id}.mp4`);
  if (!fs.existsSync(file)) return new Response("Not found", { status: 404 });

  const job = getJob(id);
  const downloadName = job?.outName || `ucus-saati-${id}.mp4`;
  const stat = fs.statSync(file);
  const range = req.headers.get("range");

  if (range) {
    const match = range.match(/bytes=(\d*)-(\d*)/);
    let start = match && match[1] ? parseInt(match[1], 10) : 0;
    let end = match && match[2] ? parseInt(match[2], 10) : stat.size - 1;
    if (isNaN(start)) start = 0;
    if (isNaN(end) || end >= stat.size) end = stat.size - 1;
    return new Response(fileToWebStream(file, { start, end }) as any, {
      status: 206,
      headers: {
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(end - start + 1),
        "Content-Type": "video/mp4",
      },
    });
  }

  return new Response(fileToWebStream(file) as any, {
    status: 200,
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(stat.size),
      "Accept-Ranges": "bytes",
      "Content-Disposition": `attachment; filename="${downloadName}"`,
    },
  });
}
