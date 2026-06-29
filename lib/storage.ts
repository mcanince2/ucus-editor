import path from "node:path";
import fs from "node:fs";
import os from "node:os";

// Working files dir. Locally / on a container this is <project>/.data.
// On read-only serverless filesystems (e.g. Vercel) only /tmp is writable.
function resolveDataDir(): string {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  if (process.env.VERCEL || process.env.SERVERLESS) return path.join(os.tmpdir(), "ucus-editor-data");
  return path.join(process.cwd(), ".data");
}
export const DATA_DIR = resolveDataDir();
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
export const THUMB_DIR = path.join(DATA_DIR, "thumbs");
export const MUSIC_DIR = path.join(DATA_DIR, "music");
export const EXPORT_DIR = path.join(DATA_DIR, "exports");
export const TMP_DIR = path.join(DATA_DIR, "tmp");

export function ensureDirs() {
  for (const d of [DATA_DIR, UPLOAD_DIR, THUMB_DIR, MUSIC_DIR, EXPORT_DIR, TMP_DIR]) {
    fs.mkdirSync(d, { recursive: true });
  }
}

/** Locate a stored upload by id. We store as <id>.<ext>; find the match. */
export function findUpload(id: string): string | null {
  ensureDirs();
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return null;
  try {
    const matches = fs.readdirSync(UPLOAD_DIR).filter((f) => f.startsWith(id + "."));
    if (matches.length) return path.join(UPLOAD_DIR, matches[0]);
  } catch {}
  return null;
}

export function uploadPath(id: string, ext: string): string {
  ensureDirs();
  const clean = ext.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "bin";
  return path.join(UPLOAD_DIR, `${id}.${clean}`);
}

export function thumbPath(id: string): string {
  ensureDirs();
  return path.join(THUMB_DIR, `${id}.jpg`);
}

export function freshTmp(suffix: string): string {
  ensureDirs();
  const name = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${suffix}`;
  return path.join(TMP_DIR, name);
}

export function contentTypeFor(file: string): string {
  const ext = path.extname(file).toLowerCase();
  const map: Record<string, string> = {
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".webm": "video/webm",
    ".m4v": "video/x-m4v",
    ".avi": "video/x-msvideo",
    ".mkv": "video/x-matroska",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".ogg": "audio/ogg",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".jpg_thumb": "image/jpeg",
  };
  return map[ext] || "application/octet-stream";
}

/**
 * Stream a file (optionally a byte range) as a web ReadableStream that is
 * SAFE against client aborts. Node's built-in Readable.toWeb throws an
 * uncaught ERR_INVALID_STATE when the browser cancels a request mid-stream
 * (very common with <video> range/seek requests and page reloads); guarding
 * enqueue + destroying the file handle on cancel avoids crashing the server.
 */
export function fileToWebStream(file: string, opts?: { start: number; end: number }): ReadableStream<Uint8Array> {
  const rs = fs.createReadStream(file, opts);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      rs.on("data", (chunk: Buffer | string) => {
        const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
        try {
          controller.enqueue(new Uint8Array(buf));
        } catch {
          rs.destroy();
          return;
        }
        if (controller.desiredSize !== null && controller.desiredSize <= 0) rs.pause();
      });
      rs.on("end", () => {
        try {
          controller.close();
        } catch {}
      });
      rs.on("error", (err) => {
        try {
          controller.error(err);
        } catch {}
      });
    },
    pull() {
      rs.resume();
    },
    cancel() {
      rs.destroy();
    },
  });
}

export { os };
