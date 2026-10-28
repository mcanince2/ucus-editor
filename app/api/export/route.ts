import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { findUpload, EXPORT_DIR, freshTmp, ensureDirs } from "@/lib/storage";
import { runFfmpegProgress } from "@/lib/ffmpeg";
import {
  buildExport,
  evenify,
  planTransitions,
  timelineToExportTime,
  ffmpegErrorHint,
  type BuildInput,
  type ClipSource,
} from "@/lib/export-builder";
import { buildAss } from "@/lib/subtitles";
import { clipDuration } from "@/lib/timeline";
import { generateTrack, trackPath } from "@/lib/music";
import { ASPECT_PRESETS, QUALITY_PRESETS } from "@/lib/constants";
import { createJob, updateJob, setJobChild, clearJobChild, isCancelled } from "@/lib/jobs";
import { nextCount, seriesFileName } from "@/lib/counters";
import type { ExportRequest, SeriesType, SubtitleCue } from "@/lib/types";
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

/** RNNoise speech model shipped with the app (used by ffmpeg's arnndn). */
function rnnoiseModelPath(): string | undefined {
  const p = process.env.RNNOISE_MODEL || path.join(process.cwd(), "models", "rnnoise", "sh.rnnn");
  return fs.existsSync(p) ? p : undefined;
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

/** Which features a render attempt uses; later attempts drop the fancy ones. */
interface AttemptOpts {
  transitions: boolean;
  /** Safe mode: plain scale/pad, no loudness/denoise filters. */
  safe: boolean;
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
  const missing: string[] = [];
  for (const c of doc.clips) {
    const file = findUpload(c.assetId);
    const meta = assetMap.get(c.assetId);
    if (!file || !fs.existsSync(file)) {
      missing.push(c.assetId);
      continue;
    }
    clips.push({
      path: file,
      in: c.in,
      out: c.out,
      speed: c.speed || 1,
      muted: c.muted,
      volume: c.volume,
      transition: c.transition,
      durationOut: clipDuration(c),
      hasAudio: meta?.hasAudio ?? true,
    });
  }
  if (!clips.length) {
    return NextResponse.json(
      {
        error:
          "Klip kaynak dosyaları sunucuda bulunamadı. Sunucu yeniden başlamış olabilir; klipleri yeniden yükleyin.",
      },
      { status: 400 }
    );
  }
  if (missing.length) {
    console.warn(`[export] ${missing.length} clip source(s) missing on disk, skipping:`, missing.join(", "));
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

  // Editor-timeline start of each clip that made it into the render.
  const starts: number[] = [];
  {
    let t = 0;
    for (const c of clips) {
      starts.push(t);
      t += c.durationOut;
    }
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
    } else {
      console.warn("[export] music source not found on disk, rendering without music");
    }
  }

  const font = detectFont();
  const jobId = uid("exp_");
  const intermediatePath = freshTmp("_mid.mp4");
  const outPath = path.join(EXPORT_DIR, `${jobId}.mp4`);

  /**
   * Build the render input for one attempt. Subtitle / overlay / audio-track
   * times are authored on the editor timeline (clips laid end to end); when
   * crossfades overlap clips, everything after a fade has to move earlier by
   * the overlap — otherwise captions run ahead of the picture.
   */
  const prepare = (opt: AttemptOpts): BuildInput => {
    const plan = planTransitions(clips, opt.transitions && clips.length > 1, doc.settings.transitionDuration);
    const toExport = (t: number) => timelineToExportTime(t, starts, plan);

    let assPath: string | undefined;
    if (doc.subtitles.length) {
      const shifted: SubtitleCue[] = doc.subtitles
        .map((cue) => {
          const s = toExport(cue.start);
          const e = Math.max(s + 0.1, toExport(cue.end));
          return {
            ...cue,
            start: s,
            end: e,
            words: cue.words?.map((w) => {
              const ws = toExport(w.start);
              return { ...w, start: ws, end: Math.max(ws + 0.05, toExport(w.end)) };
            }),
          };
        })
        .filter((c) => c.end > c.start);
      assPath = freshTmp(".ass");
      fs.writeFileSync(assPath, buildAss(shifted, doc.subtitleStyle, { width: W, height: H }), "utf8");
    }

    const audioPlans: NonNullable<BuildInput["audioTracks"]> = [];
    for (const t of doc.audioTracks || []) {
      const ap = findUpload(t.assetId);
      if (ap && fs.existsSync(ap)) {
        audioPlans.push({
          path: ap,
          start: toExport(t.start),
          volume: t.volume,
          fadeIn: t.fadeIn,
          fadeOut: t.fadeOut,
        });
      }
    }

    const overlayPlans: NonNullable<BuildInput["overlays"]> = [];
    for (const o of doc.overlays || []) {
      const op = findUpload(o.assetId);
      const om = assetMap.get(o.assetId);
      if (op && fs.existsSync(op)) {
        overlayPlans.push({
          path: op,
          kind: o.kind,
          start: toExport(o.start),
          duration: o.kind === "video" && om?.duration ? Math.min(o.duration, om.duration) : o.duration,
          x: o.x,
          y: o.y,
          scale: o.scale,
          opacity: o.opacity,
        });
      }
    }

    return {
      clips,
      width: W,
      height: H,
      fps,
      blurFill: opt.safe ? false : doc.settings.blurFill,
      transitions: opt.transitions,
      transitionDuration: doc.settings.transitionDuration,
      normalizeVoice: opt.safe ? false : doc.settings.normalizeVoice,
      denoise: opt.safe ? false : doc.settings.denoise,
      rnnoiseModel: !opt.safe && doc.settings.noiseSuppression ? rnnoiseModelPath() : undefined,
      noiseStrength: doc.settings.noiseStrength,
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
  };

  const seriesType = (doc.settings.seriesType || "minik") as SeriesType;

  createJob(jobId);
  // Run asynchronously; client polls /api/export/[id].
  runExport(jobId, prepare, doc.settings.transitions, seriesType).catch((e) => {
    console.error("[export] unexpected failure:", e);
    updateJob(jobId, { status: "error", error: "Beklenmeyen hata: " + String(e?.message || e) });
  });

  return NextResponse.json({ jobId });
}

async function runExport(
  jobId: string,
  prepare: (opt: AttemptOpts) => BuildInput,
  wantTransitions: boolean,
  seriesType: SeriesType
) {
  const reg = (child: any) => setJobChild(jobId, child);

  // ── PASS 1: concat / crossfade + audio mix ──
  // Attempt ladder: as requested → no transitions → safe mode (plain graph).
  const attempts: AttemptOpts[] = [];
  if (wantTransitions) attempts.push({ transitions: true, safe: false });
  attempts.push({ transitions: false, safe: false });
  attempts.push({ transitions: false, safe: true });

  let input: BuildInput | null = null;
  let built: ReturnType<typeof buildExport> | null = null;
  let lastErr = "";
  updateJob(jobId, { status: "running", stage: "Klipler birleştiriliyor ve ses karıştırılıyor", progress: 2 });
  for (const opt of attempts) {
    const inp = prepare(opt);
    const b = buildExport(inp);
    const r = await runFfmpegProgress(
      b.pass1,
      b.mainDuration,
      (f) => updateJob(jobId, { progress: Math.round(f * 55) }),
      reg
    );
    if (isCancelled(jobId)) {
      clearJobChild(jobId);
      return;
    }
    if (r.code === 0 && fs.existsSync(inp.intermediatePath)) {
      input = inp;
      built = b;
      break;
    }
    lastErr = ffmpegErrorHint(r.stderr);
    console.error(
      `[export ${jobId}] pass1 failed (transitions=${opt.transitions} safe=${opt.safe}) code=${r.code}\n` +
        `filter_complex: ${b.pass1[b.pass1.indexOf("-filter_complex") + 1]}\n` +
        r.stderr.slice(-6000)
    );
    updateJob(jobId, { stage: opt.safe ? "Yeniden deneniyor" : "Basit modda yeniden deneniyor", progress: 2 });
  }
  if (!input || !built) {
    updateJob(jobId, {
      status: "error",
      error: "Klipler birleştirilemedi (ffmpeg). " + lastErr,
    });
    return;
  }

  // ── PASS 2: logo + subtitles + intro/outro + final encode ──
  if (built.pass2) {
    updateJob(jobId, { stage: "Logo, altyazı ve son işleme uygulanıyor", progress: 58 });
    let r2 = await runFfmpegProgress(
      built.pass2,
      built.totalDuration,
      (f) => updateJob(jobId, { progress: 58 + Math.round(f * 40) }),
      reg
    );
    if (isCancelled(jobId)) {
      clearJobChild(jobId);
      return;
    }
    if (r2.code !== 0) {
      console.error(`[export ${jobId}] pass2 failed code=${r2.code}\n` + r2.stderr.slice(-6000));
    }
    if (r2.code !== 0 && (input.intro || input.outro || (input.overlays && input.overlays.length))) {
      // Fallback: drop intro/outro + overlays but keep logo + subtitles.
      const noEnds = buildExport({ ...input, intro: undefined, outro: undefined, overlays: [] });
      if (noEnds.pass2) {
        updateJob(jobId, { stage: "Intro/outro olmadan yeniden deneniyor", progress: 58 });
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
        if (r2.code !== 0) {
          console.error(`[export ${jobId}] pass2 (no intro/outro) failed code=${r2.code}\n` + r2.stderr.slice(-6000));
        }
      }
    }
    if (r2.code !== 0 && input.assPath) {
      // Last resort: no burned subtitles (font / libass trouble) — keep the logo.
      const noSubs = buildExport({ ...input, intro: undefined, outro: undefined, overlays: [], assPath: undefined });
      if (noSubs.pass2) {
        updateJob(jobId, { stage: "Altyazı gömülmeden yeniden deneniyor", progress: 58 });
        r2 = await runFfmpegProgress(
          noSubs.pass2,
          noSubs.totalDuration,
          (f) => updateJob(jobId, { progress: 58 + Math.round(f * 40) }),
          reg
        );
        if (isCancelled(jobId)) {
          clearJobChild(jobId);
          return;
        }
        if (r2.code === 0) {
          console.error(`[export ${jobId}] rendered WITHOUT subtitles after pass2 failures`);
        }
      }
    }
    if (r2.code !== 0) {
      updateJob(jobId, { status: "error", error: "Son işleme başarısız oldu. " + ffmpegErrorHint(r2.stderr) });
      return;
    }
  } else {
    // No overlays: the intermediate IS the final output.
    fs.copyFileSync(input.intermediatePath, input.outPath);
  }

  clearJobChild(jobId);

  // Cleanup intermediate + subtitle file.
  try {
    fs.existsSync(input.intermediatePath) && fs.unlinkSync(input.intermediatePath);
    input.assPath && fs.existsSync(input.assPath) && fs.unlinkSync(input.assPath);
  } catch {}

  // Only consume a counter slot on a successful render, so cancelled/failed
  // jobs never burn a number. e.g. "Minik_Pilotlarla_Roportaj_3.mp4".
  const n = nextCount(seriesType);
  // Tell the user what audio processing really went into the file (the
  // retry ladder may have dropped some of it).
  const applied: string[] = [];
  if (input.rnnoiseModel) applied.push(`Arka plan gürültüsü silindi (RNNoise %${Math.round((input.noiseStrength ?? 0.85) * 100)})`);
  if (input.denoise) applied.push("Hafif gürültü azaltma (FFT)");
  if (input.normalizeVoice) applied.push("Ses normalize edildi (loudnorm)");
  if (input.music) applied.push(input.music.duck ? "Müzik eklendi, konuşmada kısıldı" : "Müzik eklendi");
  if (input.clips.some((c) => c.volume !== undefined && Math.abs(c.volume - 1) > 0.001)) applied.push("Klip ses seviyeleri uygulandı");
  if (input.assPath) applied.push("Altyazılar gömüldü");
  updateJob(jobId, {
    status: "done",
    progress: 100,
    stage: "Tamamlandı",
    downloadUrl: `/api/download/${jobId}`,
    outName: `${seriesFileName(seriesType, n)}.mp4`,
    applied,
  });
}
