import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { findUpload, EXPORT_DIR, freshTmp, ensureDirs } from "@/lib/storage";
import { runFfmpegProgress } from "@/lib/ffmpeg";
import { buildExport, evenify, type BuildInput, type ClipSource } from "@/lib/export-builder";
import { buildAss } from "@/lib/subtitles";
import { clipDuration } from "@/lib/timeline";
import { generateTrack, trackPath } from "@/lib/music";
import { ASPECT_PRESETS, QUALITY_PRESETS } from "@/lib/constants";
import { createJob, updateJob, setJobChild, clearJobChild, isCancelled } from "@/lib/jobs";
import { nextCount, seriesFileName } from "@/lib/counters";
import type { ExportRequest, SeriesType } from "@/lib/types";
import { uid } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 3600;

const MAC_FONTS = [
  "/System/Library/Fonts/Supplemental/Arial.ttf",
  "/Library/Fonts/Arial.ttf",
  "/System/Library/Fonts/Helvetica.ttc",
  "/System/Library/Fonts/SFNS.ttf",
];

function detectFont(): string | undefined {
  return MAC_FONTS.find((f) => fs.existsSync(f));
}

function computeDimensions(aspect: string, quality: string, srcW?: number, srcH?: number) {
  const factor = quality === "preview" ? 0.6 : 1;
  let baseW: number;
  let baseH: number;
  if (aspect === "original") {
    baseW = srcW || 1080;
    baseH = srcH || 1920;
    // cap very large originals to ~1080 short side
    const shortSide = Math.min(baseW, baseH);
    if (shortSide > 1080) {
      const s = 1080 / shortSide;
      baseW *= s;
      baseH *= s;
    }
  } else {
    const p = ASPECT_PRESETS[aspect] || ASPECT_PRESETS["9:16"];
    baseW = p.w;
    baseH = p.h;
  }
  return { W: evenify(baseW * factor), H: evenify(baseH * factor) };
}

export async function POST(req: Request) {
  ensureDirs();
  const body = (await req.json().catch(() => null)) as ExportRequest | null;
  if (!body || !body.doc || !body.doc.clips?.length) {
    return NextResponse.json({ error: "Dışa aktarılacak klip yok." }, { status: 400 });
  }
  const { doc, assets } = body;
  const assetMap = new Map(assets.map((a) => [a.id, a]));

  // Resolve clip source files.
  const clips: ClipSource[] = [];
  for (const c of doc.clips) {
    const file = findUpload(c.assetId);
    const meta = assetMap.get(c.assetId);
    if (!file || !fs.existsSync(file)) continue;
    clips.push({
      path: file,
      in: c.in,
      out: c.out,
      speed: c.speed || 1,
      muted: c.muted,
      transition: c.transition,
      durationOut: clipDuration(c),
      hasAudio: meta?.hasAudio ?? true,
    });
  }
  if (!clips.length) {
    return NextResponse.json({ error: "Klip kaynak dosyaları bulunamadı." }, { status: 400 });
  }

  // Dimensions from the first video asset (for 'original').
  const firstMeta = assetMap.get(doc.clips[0].assetId);
  const { W, H } = computeDimensions(
    doc.settings.aspect,
    doc.settings.quality,
    firstMeta?.width,
    firstMeta?.height
  );
  const fps = doc.settings.fps || 30;
  const qual = QUALITY_PRESETS[doc.settings.quality] || QUALITY_PRESETS.hd;

  // Subtitle ASS file.
  let assPath: string | undefined;
  if (doc.subtitles.length) {
    assPath = freshTmp(".ass");
    fs.writeFileSync(assPath, buildAss(doc.subtitles, doc.subtitleStyle, { width: W, height: H }), "utf8");
  }

  // Logo.
  let logoPlan: BuildInput["logo"];
  let logoFile: string | undefined;
  if (doc.logo.assetId) {
    const lf = findUpload(doc.logo.assetId);
    if (lf && fs.existsSync(lf)) {
      logoFile = lf;
      logoPlan = {
        path: lf,
        position: doc.logo.position,
        x: doc.logo.x,
        y: doc.logo.y,
        scale: doc.logo.scale,
        opacity: doc.logo.opacity,
        margin: doc.logo.margin,
      };
    }
  }

  // Music.
  let musicPlan: BuildInput["music"];
  if (doc.music.source !== "none") {
    let mpath: string | null = null;
    if (doc.music.source === "upload" && doc.music.assetId) {
      mpath = findUpload(doc.music.assetId);
    } else if (doc.music.source === "builtin" && doc.music.builtinId) {
      mpath = (await generateTrack(doc.music.builtinId)) || trackPath(doc.music.builtinId);
    }
    if (mpath && fs.existsSync(mpath)) {
      musicPlan = {
        path: mpath,
        volume: doc.music.volume,
        duck: doc.music.duck,
        duckAmount: doc.music.duckAmount,
        fadeIn: doc.music.fadeIn,
        fadeOut: doc.music.fadeOut,
        loop: doc.music.loop,
      };
    }
  }

  // Extra audio-track layers.
  const audioPlans: NonNullable<BuildInput["audioTracks"]> = [];
  for (const t of doc.audioTracks || []) {
    const ap = findUpload(t.assetId);
    if (ap && fs.existsSync(ap)) {
      audioPlans.push({
        path: ap,
        start: t.start,
        volume: t.volume,
        fadeIn: t.fadeIn,
        fadeOut: t.fadeOut,
      });
    }
  }

  // Overlay (PIP) layers.
  const overlayPlans: NonNullable<BuildInput["overlays"]> = [];
  for (const o of doc.overlays || []) {
    const op = findUpload(o.assetId);
    const om = assetMap.get(o.assetId);
    if (op && fs.existsSync(op)) {
      overlayPlans.push({
        path: op,
        kind: o.kind,
        start: o.start,
        duration: o.kind === "video" && om?.duration ? Math.min(o.duration, om.duration) : o.duration,
        x: o.x,
        y: o.y,
        scale: o.scale,
        opacity: o.opacity,
      });
    }
  }

  const font = detectFont();
  const jobId = uid("exp_");
  const intermediatePath = freshTmp("_mid.mp4");
  const outPath = path.join(EXPORT_DIR, `${jobId}.mp4`);

  const baseInput: BuildInput = {
    clips,
    width: W,
    height: H,
    fps,
    blurFill: doc.settings.blurFill,
    transitions: doc.settings.transitions,
    transitionDuration: doc.settings.transitionDuration,
    normalizeVoice: doc.settings.normalizeVoice,
    denoise: doc.settings.denoise,
    music: musicPlan,
    audioTracks: audioPlans,
    overlays: overlayPlans,
    logo: logoPlan,
    assPath,
    intro: doc.settings.intro ? { title: doc.settings.introTitle, fontFile: font } : undefined,
    outro: doc.settings.outro
      ? { title: doc.settings.introTitle, logoPath: logoFile, fontFile: font }
      : undefined,
    quality: { crf: qual.crf, preset: qual.preset },
    intermediatePath,
    outPath,
  };

  const seriesType = (doc.settings.seriesType || "minik") as SeriesType;

  createJob(jobId);
  // Run asynchronously; client polls /api/export/[id].
  runExport(jobId, baseInput, seriesType).catch((e) => {
    updateJob(jobId, { status: "error", error: String(e?.message || e) });
  });

  return NextResponse.json({ jobId });
}

async function runExport(jobId: string, input: BuildInput, seriesType: SeriesType) {
  const primary = buildExport(input);

  const reg = (child: any) => setJobChild(jobId, child);

  // ── PASS 1: concat / crossfade + audio mix ──
  updateJob(jobId, { status: "running", stage: "Klipler birleştiriliyor ve ses karıştırılıyor", progress: 2 });
  let r = await runFfmpegProgress(
    primary.pass1,
    primary.mainDuration,
    (f) => updateJob(jobId, { progress: Math.round(f * 55) }),
    reg
  );
  if (isCancelled(jobId)) {
    clearJobChild(jobId);
    return;
  }
  if (r.code !== 0) {
    // Fallback: disable transitions (xfade can be picky on odd inputs).
    const noTrans = buildExport({ ...input, transitions: false });
    r = await runFfmpegProgress(
      noTrans.pass1,
      noTrans.mainDuration,
      (f) => updateJob(jobId, { progress: Math.round(f * 55) }),
      reg
    );
    if (isCancelled(jobId)) {
      clearJobChild(jobId);
      return;
    }
    if (r.code !== 0) {
      updateJob(jobId, {
        status: "error",
        error: "Birleştirme başarısız oldu. " + tail(r.stderr),
      });
      return;
    }
  }

  // ── PASS 2: logo + subtitles + intro/outro + final encode ──
  if (primary.pass2) {
    updateJob(jobId, { stage: "Logo, altyazı ve son işleme uygulanıyor", progress: 58 });
    let r2 = await runFfmpegProgress(
      primary.pass2,
      primary.totalDuration,
      (f) => updateJob(jobId, { progress: 58 + Math.round(f * 40) }),
      reg
    );
    if (isCancelled(jobId)) {
      clearJobChild(jobId);
      return;
    }
    if (r2.code !== 0 && (input.intro || input.outro || (input.overlays && input.overlays.length))) {
      // Fallback: drop intro/outro + overlays but keep logo + subtitles.
      const noEnds = buildExport({ ...input, intro: undefined, outro: undefined, overlays: [] });
      if (noEnds.pass2) {
        r2 = await runFfmpegProgress(
          noEnds.pass2,
          noEnds.totalDuration,
          (f) => updateJob(jobId, { progress: 58 + Math.round(f * 40) }),
          reg
        );
        if (isCancelled(jobId)) {
          clearJobChild(jobId);
          return;
        }
      }
    }
    if (r2.code !== 0) {
      updateJob(jobId, { status: "error", error: "Son işleme başarısız oldu. " + tail(r2.stderr) });
      return;
    }
  } else {
    // No overlays: the intermediate IS the final output.
    fs.copyFileSync(input.intermediatePath, input.outPath);
  }

  clearJobChild(jobId);

  // Cleanup intermediate.
  try {
    fs.existsSync(input.intermediatePath) && fs.unlinkSync(input.intermediatePath);
  } catch {}

  // Only consume a counter slot on a successful render, so cancelled/failed
  // jobs never burn a number. e.g. "Minik_Pilotlarla_Roportaj_3.mp4".
  const n = nextCount(seriesType);
  updateJob(jobId, {
    status: "done",
    progress: 100,
    stage: "Tamamlandı",
    downloadUrl: `/api/download/${jobId}`,
    outName: `${seriesFileName(seriesType, n)}.mp4`,
  });
}

function tail(s: string, n = 400): string {
  return (s || "").slice(-n).replace(/\s+/g, " ").trim();
}
