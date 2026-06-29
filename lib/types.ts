// ─────────────────────────────────────────────────────────────
// Shared domain types — the single source of truth for the editor.
// Used by both the client (store, components) and server (API routes).
// ─────────────────────────────────────────────────────────────

export type AssetKind = "video" | "audio" | "image";
export type AssetStatus = "uploading" | "processing" | "ready" | "error";

/** A raw uploaded media file plus its probed metadata and analysis cache. */
export interface MediaAsset {
  id: string;
  name: string;
  kind: AssetKind;
  url: string; // /api/media/<id>
  size: number; // bytes
  duration: number; // seconds (0 for images)
  width?: number;
  height?: number;
  fps?: number;
  hasAudio: boolean;
  thumbnail?: string; // /api/media/<id>?thumb=1
  status: AssetStatus;
  progress?: number; // 0..100 while uploading
  error?: string;
  /** Normalized waveform peaks (0..1), cached after analysis. */
  waveform?: number[];
  /** Detected silent regions in SOURCE time, cached after analysis. */
  silences?: TimeRange[];
  /** True once silence/transcription analysis has been run. */
  analyzed?: boolean;
}

export interface TimeRange {
  start: number;
  end: number;
}

export type TransitionType = "none" | "fade" | "slide" | "zoom";

/** A clip on the timeline = a trimmed window into a source asset. */
export interface Clip {
  id: string;
  assetId: string;
  in: number; // source seconds (inclusive)
  out: number; // source seconds (exclusive)
  speed: number; // playback speed multiplier (1 = normal)
  muted: boolean;
  /** Transition INTO this clip (from the previous clip). */
  transition: TransitionType;
}

/** A subtitle line placed in TIMELINE time. */
export interface SubtitleCue {
  id: string;
  start: number; // timeline seconds
  end: number; // timeline seconds
  text: string;
  /** Optional word-level timing for karaoke / keyword highlight styles. */
  words?: WordTiming[];
}

export interface WordTiming {
  word: string;
  start: number; // timeline seconds
  end: number;
}

export type SubtitlePreset = "clean" | "keyword" | "tiktok" | "documentary";

export interface SubtitleStyle {
  preset: SubtitlePreset;
  fontFamily: string;
  fontSize: number; // px relative to a 1080-tall canvas
  bold: boolean;
  uppercase: boolean;
  primaryColor: string; // hex, e.g. "#ffffff"
  highlightColor: string; // hex used by keyword/tiktok styles
  outlineColor: string; // hex
  outlineWidth: number; // px
  shadow: number; // px shadow distance (0 = none)
  boxColor: string; // hex for caption background box
  boxOpacity: number; // 0..1 (0 = no box)
  positionY: number; // 0 (top) .. 1 (bottom), vertical anchor
  maxCharsPerLine: number;
}

export type LogoPosition = "tl" | "tr" | "bl" | "br" | "center" | "custom";

export interface LogoState {
  assetId?: string; // image asset id
  position: LogoPosition;
  x: number; // 0..1 fraction of width (center of logo) — used when custom
  y: number; // 0..1 fraction of height (center of logo) — used when custom
  scale: number; // logo width as fraction of video width (e.g. 0.18)
  opacity: number; // 0..1
  margin: number; // edge margin fraction for preset positions
}

export interface MusicState {
  source: "none" | "builtin" | "upload";
  assetId?: string; // when uploaded
  builtinId?: string; // when from library
  name?: string;
  url?: string; // resolved playback url
  volume: number; // 0..1
  duck: boolean; // lower under speech
  duckAmount: number; // target music level under speech (0..1)
  fadeIn: number; // seconds
  fadeOut: number; // seconds
  loop: boolean;
}

/** An extra visual layer (PIP video or image) placed over the main timeline. */
export interface Overlay {
  id: string;
  assetId: string;
  kind: "video" | "image";
  start: number; // timeline seconds
  duration: number; // seconds shown
  x: number; // 0..1 center fraction
  y: number;
  scale: number; // width as fraction of frame
  opacity: number;
  muted: boolean; // video overlay audio
}

/** An extra audio layer (voiceover / SFX) mixed alongside speech + music. */
export interface AudioTrack {
  id: string;
  assetId: string;
  name?: string;
  start: number; // timeline seconds
  volume: number; // 0..1
  fadeIn: number;
  fadeOut: number;
}

export type AspectRatio = "9:16" | "16:9" | "1:1" | "original";
export type ExportQuality = "auto" | "preview" | "hd" | "full";

export interface ProjectSettings {
  aspect: AspectRatio;
  quality: ExportQuality;
  fps: number;
  normalizeVoice: boolean; // loudnorm on speech
  denoise: boolean; // light afftdn on speech
  blurFill: boolean; // blurred background fill when padding is needed
  intro: boolean; // 1s branded intro
  introTitle: string;
  outro: boolean; // 1s logo outro
  transitions: boolean; // subtle crossfades between clips
  transitionDuration: number; // seconds
}

export type SilenceSensitivity = "light" | "balanced" | "aggressive";

export interface AutoEditSettings {
  sensitivity: SilenceSensitivity;
  /** Keep this much speech padding (seconds) around detected speech. */
  padding: number;
  /** Drop speech segments shorter than this (removes blips). */
  minKeep: number;
  removeSilence: boolean;
}

export type PanelId = "media" | "subtitles" | "logo" | "music" | "layers" | "auto" | "export";

/** The serializable project document (the part covered by undo/redo). */
export interface ProjectDoc {
  clips: Clip[];
  subtitles: SubtitleCue[];
  subtitleStyle: SubtitleStyle;
  logo: LogoState;
  music: MusicState;
  overlays: Overlay[];
  audioTracks: AudioTrack[];
  settings: ProjectSettings;
  autoEdit: AutoEditSettings;
}

// ── Computed timeline shapes ──────────────────────────────────

export interface PlacedClip extends Clip {
  /** Timeline start time (seconds). */
  start: number;
  /** Timeline duration after speed (seconds). */
  duration: number;
  /** Timeline end (start + duration). */
  end: number;
  index: number;
}

export interface Timeline {
  clips: PlacedClip[];
  duration: number;
}

// ── API payload shapes ────────────────────────────────────────

export interface HealthInfo {
  ffmpeg: boolean;
  ffmpegVersion?: string;
  ffprobe: boolean;
  whisperLocal: boolean;
  openai: boolean;
  transcribeReady: boolean;
  provider: string;
  whisperModel: string;
}

export interface ProbeResult {
  duration: number;
  width?: number;
  height?: number;
  fps?: number;
  hasAudio: boolean;
  kind: AssetKind;
}

export interface SilenceResult {
  silences: TimeRange[];
  waveform: number[];
  duration: number;
}

export interface TranscriptResult {
  cues: { start: number; end: number; text: string; words?: WordTiming[] }[];
  language: string;
}

export interface BuiltinTrack {
  id: string;
  name: string;
  mood: string;
  url: string;
  duration: number;
}

export interface ExportRequest {
  doc: ProjectDoc;
  // Asset metadata the server needs to locate & size sources.
  assets: {
    id: string;
    kind: AssetKind;
    width?: number;
    height?: number;
    duration: number;
    hasAudio: boolean;
  }[];
}

export interface ExportJob {
  id: string;
  status: "queued" | "running" | "done" | "error";
  progress: number; // 0..100
  stage: string;
  error?: string;
  downloadUrl?: string;
  outName?: string;
}
