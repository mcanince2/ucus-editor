import type {
  AutoEditSettings,
  LogoState,
  MusicState,
  ProjectSettings,
  SilenceSensitivity,
  SubtitlePreset,
  SubtitleStyle,
} from "./types";

export const ACCEPTED_VIDEO = [".mp4", ".mov", ".webm", ".m4v", ".avi", ".mkv"];
export const ACCEPTED_AUDIO = [".mp3", ".wav", ".m4a", ".aac", ".ogg"];
export const ACCEPTED_IMAGE = [".png", ".jpg", ".jpeg", ".webp", ".svg"];

/**
 * Maps the three user-facing sensitivities to ffmpeg silencedetect params.
 * `pad` is how much speech (sn) we keep around each detected speech segment —
 * smaller pad = more actually removed. Real footage has room tone, so the
 * noise thresholds are intentionally high (less negative) to catch noisy pauses.
 */
export const SILENCE_PROFILES: Record<
  SilenceSensitivity,
  { noiseDb: number; minSilence: number; pad: number; label: string; hint: string }
> = {
  light: {
    noiseDb: -34,
    minSilence: 0.7,
    pad: 0.12,
    label: "Hafif kesim",
    hint: "Sadece uzun, belirgin sessizlikleri kırpar. Doğal akışı korur.",
  },
  balanced: {
    noiseDb: -25,
    minSilence: 0.32,
    pad: 0.05,
    label: "Dengeli kesim",
    hint: "Önerilen. Sıkıya yakın; boşlukları belirgin şekilde temizler.",
  },
  aggressive: {
    noiseDb: -21,
    minSilence: 0.25,
    pad: 0.035,
    label: "Sıkı kesim",
    hint: "Tüm ölü anları ve gürültülü boşlukları atar. Hızlı, tempolu kurgu.",
  },
};

export const ASPECT_PRESETS: Record<
  string,
  { label: string; w: number; h: number; ratio: number | null }
> = {
  "9:16": { label: "TikTok / Reels / Shorts", w: 1080, h: 1920, ratio: 9 / 16 },
  "16:9": { label: "YouTube", w: 1920, h: 1080, ratio: 16 / 9 },
  "1:1": { label: "Instagram Kare", w: 1080, h: 1080, ratio: 1 },
  original: { label: "Orijinal boyut", w: 0, h: 0, ratio: null },
};

export const QUALITY_PRESETS: Record<
  string,
  { label: string; crf: number; preset: string; scaleH?: number; hint: string }
> = {
  // "auto" = optimized: high visual quality at the smallest sensible file size
  // (slow x264 preset compresses harder for the same CRF). Default first option.
  auto: { label: "Otomatik", crf: 22, preset: "slow", hint: "En iyi kalite / en küçük boyut. Önerilen." },
  preview: { label: "Hızlı", crf: 30, preset: "veryfast", scaleH: 720, hint: "Düşük boyut, hızlı render." },
  hd: { label: "HD", crf: 21, preset: "medium", scaleH: 1080, hint: "Sosyal medya için yüksek kalite." },
  full: { label: "Tam", crf: 17, preset: "slow", hint: "Maksimum kalite, daha yavaş ve büyük." },
};

// Brand defaults: gold text (#FFC118) on a dark box (#3A3232), Fira Sans.
export const SUBTITLE_PRESETS: Record<SubtitlePreset, Omit<SubtitleStyle, "preset">> = {
  clean: {
    fontFamily: "Fira Sans",
    fontSize: 52,
    bold: true,
    uppercase: false,
    primaryColor: "#FFC118",
    highlightColor: "#FFFFFF",
    outlineColor: "#3A3232",
    outlineWidth: 3,
    shadow: 4,
    boxColor: "#3A3232",
    boxOpacity: 0,
    positionY: 0.82,
    maxCharsPerLine: 34,
  },
  keyword: {
    fontFamily: "Fira Sans",
    fontSize: 25,
    bold: false, // white base text is regular weight…
    uppercase: false,
    primaryColor: "#FFFFFF",
    highlightColor: "#FFC118", // …highlighted keywords are gold + bold
    outlineColor: "#3A3232",
    outlineWidth: 0,
    shadow: 0,
    boxColor: "#3A3232",
    boxOpacity: 0.9,
    positionY: 0.8,
    maxCharsPerLine: 24,
  },
  tiktok: {
    fontFamily: "Fira Sans",
    fontSize: 60,
    bold: true,
    uppercase: true,
    primaryColor: "#FFC118",
    highlightColor: "#4BC5E8",
    outlineColor: "#3A3232",
    outlineWidth: 0,
    shadow: 0,
    boxColor: "#3A3232",
    boxOpacity: 0.92,
    positionY: 0.74,
    maxCharsPerLine: 24,
  },
  documentary: {
    fontFamily: "Fira Sans",
    fontSize: 44,
    bold: false,
    uppercase: false,
    primaryColor: "#FFC118",
    highlightColor: "#4BC5E8",
    outlineColor: "#3A3232",
    outlineWidth: 0,
    shadow: 3,
    boxColor: "#3A3232",
    boxOpacity: 0.0,
    positionY: 0.9,
    maxCharsPerLine: 42,
  },
};

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  preset: "keyword",
  ...SUBTITLE_PRESETS.keyword,
};

export const DEFAULT_LOGO: LogoState = {
  assetId: undefined,
  position: "custom",
  x: 0.5, // horizontal 50%
  y: 0.16, // vertical 16%
  scale: 0.32,
  opacity: 0.92,
  margin: 0.04,
};

export const DEFAULT_MUSIC: MusicState = {
  // Default to a built-in, royalty-free bed so every export has music out of
  // the box (the licensed "Consumerism" track isn't shipped publicly).
  source: "builtin",
  builtinId: "uplift",
  name: "Umut",
  volume: 0.28,
  duck: true,
  duckAmount: 0.12,
  fadeIn: 0.8,
  fadeOut: 1.2,
  loop: true,
};

export const DEFAULT_SETTINGS: ProjectSettings = {
  aspect: "9:16",
  quality: "auto",
  fps: 30,
  normalizeVoice: true,
  denoise: false,
  blurFill: true,
  intro: false,
  introTitle: "Uçuş Saati",
  outro: false,
  transitions: true,
  transitionDuration: 0.35,
};

export const DEFAULT_AUTOEDIT: AutoEditSettings = {
  sensitivity: "balanced",
  padding: 0.07,
  minKeep: 0.3,
  removeSilence: true,
};

export const FONT_OPTIONS = ["Fira Sans", "Arial", "Helvetica", "Georgia", "Impact", "Verdana", "Trebuchet MS"];
