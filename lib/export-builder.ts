import type { LogoPosition, TransitionType } from "./types";

// ─────────────────────────────────────────────────────────────
// Pure builder: turns an edit plan into two ffmpeg argument lists.
//  Pass 1 → concatenate/crossfade clips + mix audio (music, ducking,
//           loudness) into a uniform intermediate file.
//  Pass 2 → overlay logo, burn subtitles, add intro/outro, final encode.
// Splitting into two passes keeps each filtergraph simple and lets the
// route retry with reduced features if a fancy graph ever fails.
// ─────────────────────────────────────────────────────────────

export function evenify(n: number): number {
  return Math.max(2, Math.round(n / 2) * 2);
}

export interface ClipSource {
  path: string;
  in: number;
  out: number;
  speed: number;
  muted: boolean;
  transition: TransitionType;
  durationOut: number; // timeline seconds = (out-in)/speed
  hasAudio: boolean;
}

export interface MusicPlan {
  path: string;
  volume: number;
  duck: boolean;
  duckAmount: number;
  fadeIn: number;
  fadeOut: number;
  loop: boolean;
}

export interface LogoPlan {
  path: string;
  position: LogoPosition;
  x: number;
  y: number;
  scale: number;
  opacity: number;
  margin: number;
}

export interface OverlayPlan {
  path: string;
  kind: "video" | "image";
  start: number;
  duration: number;
  x: number;
  y: number;
  scale: number;
  opacity: number;
}

export interface AudioPlan {
  path: string;
  start: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
}

export interface BuildInput {
  clips: ClipSource[];
  width: number;
  height: number;
  fps: number;
  blurFill: boolean;
  transitions: boolean;
  transitionDuration: number;
  normalizeVoice: boolean;
  denoise: boolean;
  music?: MusicPlan;
  audioTracks?: AudioPlan[];
  // pass 2
  overlays?: OverlayPlan[];
  logo?: LogoPlan;
  assPath?: string;
  intro?: { title: string; fontFile?: string };
  outro?: { title: string; logoPath?: string; fontFile?: string };
  quality: { crf: number; preset: string };
  intermediatePath: string;
  outPath: string;
}

export interface BuildResult {
  pass1: string[];
  pass2: string[] | null;
  mainDuration: number; // duration of clips section
  totalDuration: number; // including intro/outro
}

function tempoChain(speed: number): string {
  // atempo supports 0.5..2.0; chain for extremes.
  let s = speed;
  const parts: string[] = [];
  while (s > 2.0) {
    parts.push("atempo=2.0");
    s /= 2;
  }
  while (s < 0.5) {
    parts.push("atempo=0.5");
    s *= 2;
  }
  if (Math.abs(s - 1) > 0.001) parts.push(`atempo=${s.toFixed(4)}`);
  return parts.join(",");
}

function escForFilterPath(p: string): string {
  // Inside a single-quoted filtergraph value: escape backslash and quote.
  return p.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function logoOverlayXY(pos: LogoPosition, x: number, y: number, margin: number, W: number): string {
  const m = Math.round(margin * W);
  switch (pos) {
    case "tl":
      return `${m}:${m}`;
    case "tr":
      return `main_w-overlay_w-${m}:${m}`;
    case "bl":
      return `${m}:main_h-overlay_h-${m}`;
    case "br":
      return `main_w-overlay_w-${m}:main_h-overlay_h-${m}`;
    case "center":
      return `(main_w-overlay_w)/2:(main_h-overlay_h)/2`;
    case "custom":
    default:
      return `main_w*${x.toFixed(4)}-overlay_w/2:main_h*${y.toFixed(4)}-overlay_h/2`;
  }
}

export function buildExport(input: BuildInput): BuildResult {
  const W = evenify(input.width);
  const H = evenify(input.height);
  const fps = input.fps;
  const n = input.clips.length;

  // ── Effective transition duration (clamped to safe range). ──
  const minDur = Math.min(...input.clips.map((c) => c.durationOut), 999);
  let xd = 0;
  if (input.transitions && n > 1) {
    xd = Math.min(input.transitionDuration, minDur * 0.4, 1.0);
    if (xd < 0.08) xd = 0; // too short to be safe → hard cut
  }

  const mainDuration =
    xd > 0
      ? input.clips.reduce((s, c) => s + c.durationOut, 0) - (n - 1) * xd
      : input.clips.reduce((s, c) => s + c.durationOut, 0);

  // ════════════════════ PASS 1 ════════════════════
  const args1: string[] = [];
  // Clip inputs (accurate seek + read window).
  for (const c of input.clips) {
    args1.push("-ss", c.in.toFixed(3), "-t", Math.max(0.05, c.out - c.in).toFixed(3), "-i", c.path);
  }
  const silentIdx = n;
  args1.push("-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100");
  let musicIdx = -1;
  if (input.music) {
    musicIdx = n + 1;
    if (input.music.loop) args1.push("-stream_loop", "-1");
    args1.push("-i", input.music.path);
  }
  // Extra audio-track layers (voiceover / SFX).
  const tracks = input.audioTracks || [];
  const audioTrackStartIdx = (musicIdx >= 0 ? musicIdx : silentIdx) + 1;
  for (const t of tracks) args1.push("-i", t.path);

  const fc: string[] = [];

  // Per-clip video + audio normalization.
  for (let i = 0; i < n; i++) {
    const c = input.clips[i];
    const setpts = Math.abs(c.speed - 1) > 0.001 ? `setpts=(PTS-STARTPTS)/${c.speed}` : "setpts=PTS-STARTPTS";
    let v: string;
    if (input.blurFill) {
      v =
        `[${i}:v]${setpts},split=2[bg${i}][fg${i}];` +
        `[bg${i}]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},gblur=sigma=24[bgb${i}];` +
        `[fg${i}]scale=${W}:${H}:force_original_aspect_ratio=decrease[fg2_${i}];` +
        `[bgb${i}][fg2_${i}]overlay=(W-w)/2:(H-h)/2,setsar=1,fps=${fps},format=yuv420p[v${i}]`;
    } else {
      v =
        `[${i}:v]${setpts},scale=${W}:${H}:force_original_aspect_ratio=decrease,` +
        `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=${fps},format=yuv420p[v${i}]`;
    }
    fc.push(v);

    // Audio
    if (c.hasAudio && !c.muted) {
      const tempo = tempoChain(c.speed);
      const chain = ["asetpts=PTS-STARTPTS"];
      if (tempo) chain.push(tempo);
      chain.push("aresample=44100", "aformat=channel_layouts=stereo");
      fc.push(`[${i}:a]${chain.join(",")}[a${i}]`);
    } else {
      fc.push(
        `[${silentIdx}:a]atrim=0:${c.durationOut.toFixed(3)},asetpts=PTS-STARTPTS,aresample=44100,aformat=channel_layouts=stereo[a${i}]`
      );
    }
  }

  // Concatenate or crossfade.
  if (xd > 0) {
    // Video xfade chain.
    let prevV = `v0`;
    let acc = input.clips[0].durationOut;
    for (let i = 1; i < n; i++) {
      const off = (acc - xd).toFixed(3);
      const outV = i === n - 1 ? "cv" : `xv${i}`;
      fc.push(`[${prevV}][v${i}]xfade=transition=fade:duration=${xd.toFixed(3)}:offset=${off}[${outV}]`);
      prevV = outV;
      acc = acc + input.clips[i].durationOut - xd;
    }
    if (n === 1) fc.push(`[v0]copy[cv]`);
    // Audio acrossfade chain.
    let prevA = `a0`;
    for (let i = 1; i < n; i++) {
      const outA = i === n - 1 ? "ca" : `xa${i}`;
      fc.push(`[${prevA}][a${i}]acrossfade=d=${xd.toFixed(3)}[${outA}]`);
      prevA = outA;
    }
    if (n === 1) fc.push(`[a0]acopy[ca]`);
  } else {
    const labels: string[] = [];
    for (let i = 0; i < n; i++) labels.push(`[v${i}][a${i}]`);
    fc.push(`${labels.join("")}concat=n=${n}:v=1:a=1[cv][ca]`);
  }

  // Speech audio processing.
  const speechChain: string[] = [];
  if (input.denoise) speechChain.push("afftdn=nr=12:nf=-25");
  if (input.normalizeVoice) speechChain.push("loudnorm=I=-16:TP=-1.5:LRA=11");
  let speechLabel = "ca";
  if (speechChain.length) {
    fc.push(`[ca]${speechChain.join(",")}[sp]`);
    speechLabel = "sp";
  }

  // Extra audio-track layers → delayed, faded, leveled labels.
  const trackLabels: string[] = [];
  tracks.forEach((t, i) => {
    const idx = audioTrackStartIdx + i;
    const localLen = Math.max(0.2, mainDuration - t.start);
    const chain: string[] = [`volume=${t.volume.toFixed(3)}`];
    if (t.fadeIn > 0) chain.push(`afade=t=in:st=0:d=${t.fadeIn.toFixed(2)}`);
    chain.push(`atrim=0:${localLen.toFixed(3)}`, "asetpts=PTS-STARTPTS");
    if (t.fadeOut > 0)
      chain.push(`afade=t=out:st=${Math.max(0, localLen - t.fadeOut).toFixed(2)}:d=${t.fadeOut.toFixed(2)}`);
    if (t.start > 0) {
      const ms = Math.round(t.start * 1000);
      chain.push(`adelay=${ms}|${ms}`);
    }
    chain.push("aresample=44100", "aformat=channel_layouts=stereo");
    fc.push(`[${idx}:a]${chain.join(",")}[trk${i}]`);
    trackLabels.push(`[trk${i}]`);
  });

  // Mix speech + (ducked) music + extra tracks.
  let finalAudio = speechLabel;
  let musicReady = false;
  if (input.music && musicIdx >= 0) {
    const mu = input.music;
    const mchain = [`volume=${mu.volume.toFixed(3)}`];
    if (mu.fadeIn > 0) mchain.push(`afade=t=in:st=0:d=${mu.fadeIn.toFixed(2)}`);
    if (mu.fadeOut > 0) {
      const st = Math.max(0, mainDuration - mu.fadeOut).toFixed(2);
      mchain.push(`afade=t=out:st=${st}:d=${mu.fadeOut.toFixed(2)}`);
    }
    mchain.push(`atrim=0:${mainDuration.toFixed(3)}`, "asetpts=PTS-STARTPTS", "aresample=44100", "aformat=channel_layouts=stereo");
    fc.push(`[${musicIdx}:a]${mchain.join(",")}[mus0]`);
    musicReady = true;
  }

  if (musicReady || trackLabels.length) {
    if (musicReady && input.music!.duck) {
      fc.push(`[${speechLabel}]asplit=2[sp_main][sp_sc]`);
      fc.push(`[mus0][sp_sc]sidechaincompress=threshold=0.02:ratio=8:attack=15:release=300:makeup=1[mducked]`);
      const ins = ["[sp_main]", "[mducked]", ...trackLabels];
      fc.push(`${ins.join("")}amix=inputs=${ins.length}:normalize=0:dropout_transition=0[aout]`);
    } else {
      const ins = [`[${speechLabel}]`, ...(musicReady ? ["[mus0]"] : []), ...trackLabels];
      fc.push(`${ins.join("")}amix=inputs=${ins.length}:normalize=0:dropout_transition=0[aout]`);
    }
    finalAudio = "aout";
  }

  args1.push(
    "-filter_complex",
    fc.join(";"),
    "-map",
    "[cv]",
    "-map",
    `[${finalAudio}]`,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "18",
    "-pix_fmt",
    "yuv420p",
    "-r",
    String(fps),
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-ar",
    "44100",
    "-movflags",
    "+faststart",
    "-t",
    (mainDuration + 0.1).toFixed(3),
    input.intermediatePath
  );

  // ════════════════════ PASS 2 ════════════════════
  const overlays = input.overlays || [];
  const needPass2 = !!(input.logo || input.assPath || input.intro || input.outro || overlays.length);
  let pass2: string[] | null = null;
  const introDur = input.intro ? 1.0 : 0;
  const outroDur = input.outro ? 1.4 : 0;
  const totalDuration = introDur + mainDuration + outroDur;

  if (needPass2) {
    const a2: string[] = [];
    a2.push("-i", input.intermediatePath); // index 0
    let idx = 1;
    // Overlay (PIP) layer inputs — images are looped to span their window.
    const overlayIdx: number[] = [];
    for (const ov of overlays) {
      if (ov.kind === "image") {
        a2.push("-loop", "1", "-t", (ov.start + ov.duration + 0.3).toFixed(2), "-i", ov.path);
      } else {
        a2.push("-i", ov.path);
      }
      overlayIdx.push(idx++);
    }
    let logoIdx = -1;
    let outroLogoIdx = -1;
    if (input.logo) {
      a2.push("-i", input.logo.path);
      logoIdx = idx++;
    }
    if (input.outro?.logoPath) {
      a2.push("-i", input.outro.logoPath);
      outroLogoIdx = idx++;
    }

    const f2: string[] = [];
    let mainV = "0:v";

    // Composite overlay layers (under the logo).
    overlays.forEach((ov, i) => {
      const inIdx = overlayIdx[i];
      const w = evenify(W * ov.scale);
      const end = (ov.start + ov.duration).toFixed(3);
      if (ov.kind === "image") {
        f2.push(`[${inIdx}:v]scale=${w}:-1,format=rgba,colorchannelmixer=aa=${ov.opacity.toFixed(3)}[ovl${i}]`);
      } else {
        f2.push(
          `[${inIdx}:v]trim=0:${ov.duration.toFixed(3)},setpts=PTS-STARTPTS+${ov.start.toFixed(3)}/TB,` +
            `scale=${w}:-1,format=rgba,colorchannelmixer=aa=${ov.opacity.toFixed(3)}[ovl${i}]`
        );
      }
      const xy = `main_w*${ov.x.toFixed(4)}-overlay_w/2:main_h*${ov.y.toFixed(4)}-overlay_h/2`;
      const out = `ovs${i}`;
      f2.push(
        `[${mainV}][ovl${i}]overlay=${xy}:enable='between(t,${ov.start.toFixed(3)},${end})':eof_action=pass[${out}]`
      );
      mainV = out;
    });

    // Overlay logo on main.
    if (input.logo && logoIdx >= 0) {
      const lw = evenify(W * input.logo.scale);
      f2.push(
        `[${logoIdx}:v]scale=${lw}:-1,format=rgba,colorchannelmixer=aa=${input.logo.opacity.toFixed(3)}[lg]`
      );
      const xy = logoOverlayXY(input.logo.position, input.logo.x, input.logo.y, input.logo.margin, W);
      f2.push(`[${mainV}][lg]overlay=${xy}:format=auto[mv1]`);
      mainV = "mv1";
    }
    // Burn subtitles on main.
    if (input.assPath) {
      f2.push(`[${mainV}]subtitles=filename='${escForFilterPath(input.assPath)}'[mainv]`);
      mainV = "mainv";
    } else {
      f2.push(`[${mainV}]copy[mainv]`);
      mainV = "mainv";
    }

    const segV: string[] = [];
    const segA: string[] = [];

    // Intro
    if (input.intro) {
      const t = sanitizeText(input.intro.title || "");
      const font = input.intro.fontFile ? `:fontfile='${escForFilterPath(input.intro.fontFile)}'` : "";
      const draw = t
        ? `,drawtext=text='${t}'${font}:fontcolor=white:fontsize=${Math.round(H * 0.07)}:` +
          `x=(w-text_w)/2:y=(h-text_h)/2:alpha='if(lt(t,0.2),t/0.2,if(gt(t,0.8),(1-t)/0.2,1))'`
        : "";
      f2.push(
        `color=c=0x0e0e16:s=${W}x${H}:r=${fps}:d=${introDur}${draw},format=yuv420p,setsar=1[iv]`
      );
      f2.push(`anullsrc=channel_layout=stereo:sample_rate=44100,atrim=0:${introDur},asetpts=PTS-STARTPTS[ia]`);
      segV.push("[iv]");
      segA.push("[ia]");
    }

    segV.push(`[${mainV}]`);
    segA.push(`[0:a]`);

    // Outro
    if (input.outro) {
      let ov = "ocolor";
      f2.push(`color=c=0x0e0e16:s=${W}x${H}:r=${fps}:d=${outroDur},format=yuv420p,setsar=1[ocolor]`);
      if (outroLogoIdx >= 0) {
        const lw = evenify(W * 0.34);
        f2.push(`[${outroLogoIdx}:v]scale=${lw}:-1,format=rgba[olg]`);
        f2.push(`[ocolor][olg]overlay=(W-w)/2:(H-h)/2-${Math.round(H * 0.04)}[ov1]`);
        ov = "ov1";
      }
      const t = sanitizeText(input.outro.title || "");
      if (t) {
        const font = input.outro.fontFile ? `:fontfile='${escForFilterPath(input.outro.fontFile)}'` : "";
        f2.push(
          `[${ov}]drawtext=text='${t}'${font}:fontcolor=white:fontsize=${Math.round(H * 0.045)}:` +
            `x=(w-text_w)/2:y=h*0.62[ov2]`
        );
        ov = "ov2";
      }
      f2.push(`[${ov}]format=yuv420p,setsar=1[ovf]`);
      f2.push(`anullsrc=channel_layout=stereo:sample_rate=44100,atrim=0:${outroDur},asetpts=PTS-STARTPTS[oa]`);
      segV.push("[ovf]");
      segA.push("[oa]");
    }

    // Concatenate segments (intro? main outro?).
    let mapVideo: string;
    let mapAudio: string;
    if (segV.length > 1) {
      const inter: string[] = [];
      for (let i = 0; i < segV.length; i++) inter.push(segV[i], segA[i]);
      f2.push(`${inter.join("")}concat=n=${segV.length}:v=1:a=1[fv][fa]`);
      mapVideo = "[fv]";
      mapAudio = "[fa]";
    } else {
      // mainV is a filtergraph label (bracketed); the intermediate's audio is a
      // raw input stream and must be mapped WITHOUT brackets.
      mapVideo = `[${mainV}]`;
      mapAudio = "0:a";
    }

    a2.push(
      "-filter_complex",
      f2.join(";"),
      "-map",
      mapVideo,
      "-map",
      mapAudio,
      "-c:v",
      "libx264",
      "-preset",
      input.quality.preset,
      "-crf",
      String(input.quality.crf),
      "-pix_fmt",
      "yuv420p",
      "-r",
      String(fps),
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-ar",
      "44100",
      "-movflags",
      "+faststart",
      input.outPath
    );
    pass2 = a2;
  }

  return { pass1: args1, pass2, mainDuration, totalDuration };
}

function sanitizeText(t: string): string {
  // drawtext text escaping: remove characters that break the filtergraph.
  return t
    .replace(/\\/g, "")
    .replace(/'/g, "")
    .replace(/:/g, " ")
    .replace(/%/g, "")
    .replace(/[\[\]]/g, "")
    .slice(0, 60);
}
