import fs from "node:fs";
import path from "node:path";
import { findUpload, freshTmp, ensureDirs } from "@/lib/storage";
import { run, FFMPEG } from "@/lib/ffmpeg";
import { escForFilterPath } from "@/lib/export-builder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAMPLE_SECONDS = 8;

/**
 * Render a short audio sample of one clip through the SAME speech-cleanup
 * chain the export uses, so the user can hear what "Ses temizliği" does.
 * Body: { assetId, in, out, raw, noiseSuppression, noiseStrength, denoise, normalizeVoice }
 * Returns audio/mpeg.
 */
export async function POST(req: Request) {
  ensureDirs();
  const body = await req.json().catch(() => null);
  const id: string = body?.assetId || "";
  const file = id && findUpload(id);
  if (!file || !fs.existsSync(file)) return Response.json({ error: "Klip bulunamadı." }, { status: 404 });

  const start = Math.max(0, Number(body?.in) || 0);
  const outT = Number(body?.out);
  const len = Math.max(1, Math.min(SAMPLE_SECONDS, isFinite(outT) && outT > start ? outT - start : SAMPLE_SECONDS));

  const chain: string[] = [];
  if (!body?.raw) {
    const model = process.env.RNNOISE_MODEL || path.join(process.cwd(), "models", "rnnoise", "sh.rnnn");
    if (body?.noiseSuppression && fs.existsSync(model)) {
      const mix = Math.max(0.1, Math.min(1, Number(body?.noiseStrength) || 0.85)).toFixed(2);
      chain.push("aresample=48000", `arnndn=m='${escForFilterPath(model)}':mix=${mix}`, "aresample=44100");
    }
    if (body?.denoise) chain.push("afftdn=nr=12:nf=-25");
    if (body?.normalizeVoice) chain.push("loudnorm=I=-16:TP=-1.5:LRA=11");
  }
  chain.push("aresample=44100", "aformat=channel_layouts=stereo");

  const out = freshTmp(".mp3");
  const r = await run(FFMPEG, [
    "-y",
    "-ss",
    start.toFixed(3),
    "-t",
    len.toFixed(3),
    "-i",
    file,
    "-vn",
    "-af",
    chain.join(","),
    "-c:a",
    "libmp3lame",
    "-b:a",
    "128k",
    out,
  ]);
  if (r.code !== 0 || !fs.existsSync(out)) {
    console.error("[audio-preview] ffmpeg failed:", r.stderr.slice(-800));
    return Response.json({ error: "Örnek üretilemedi: " + r.stderr.slice(-200) }, { status: 500 });
  }
  const buf = fs.readFileSync(out);
  try {
    fs.unlinkSync(out);
  } catch {}
  return new Response(buf, {
    headers: { "Content-Type": "audio/mpeg", "Content-Length": String(buf.length), "Cache-Control": "no-store" },
  });
}
