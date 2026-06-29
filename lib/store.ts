"use client";

import { create } from "zustand";
import type {
  Clip,
  MediaAsset,
  PanelId,
  ProjectDoc,
  SubtitleCue,
  SubtitleStyle,
  LogoState,
  MusicState,
  ProjectSettings,
  AutoEditSettings,
  SubtitlePreset,
  HealthInfo,
  Overlay,
  AudioTrack,
} from "./types";
import {
  DEFAULT_AUTOEDIT,
  DEFAULT_LOGO,
  DEFAULT_MUSIC,
  DEFAULT_SETTINGS,
  DEFAULT_SUBTITLE_STYLE,
  SUBTITLE_PRESETS,
} from "./constants";
import { buildClipsFromAssets, buildTimeline, splitClips, moveItem } from "./timeline";
import { clamp, uid } from "./format";

interface UIState {
  assets: MediaAsset[];
  activePanel: PanelId;
  selectedClipId?: string;
  selectedCueId?: string;
  currentTime: number;
  playing: boolean;
  zoom: number; // pixels per second on the timeline
  busy: { task: string; progress?: number } | null;
  toast: { kind: "info" | "error" | "success"; msg: string } | null;
  /** Bumped on every explicit seek so the player resyncs even mid-playback. */
  seekNonce: number;
  health: HealthInfo | null;
}

type DocKey = keyof ProjectDoc;

interface StoreState extends ProjectDoc, UIState {
  _past: ProjectDoc[];
  _future: ProjectDoc[];

  // assets
  addAsset: (a: MediaAsset) => void;
  updateAsset: (id: string, patch: Partial<MediaAsset>) => void;
  removeAsset: (id: string) => void;
  reorderAssets: (from: number, to: number) => void;

  // timeline / clips (history-tracked)
  buildAutoTimeline: () => void;
  setClips: (clips: Clip[]) => void;
  updateClip: (id: string, patch: Partial<Clip>) => void;
  splitClipAtSource: (id: string, sourceTime: number) => void;
  removeClip: (id: string) => void;
  moveClip: (from: number, to: number) => void;
  duplicateClip: (id: string) => void;

  // subtitles
  setSubtitles: (cues: SubtitleCue[]) => void;
  addCue: (cue: SubtitleCue) => void;
  updateCue: (id: string, patch: Partial<SubtitleCue>) => void;
  removeCue: (id: string) => void;
  setSubtitleStyle: (patch: Partial<SubtitleStyle>) => void;
  applySubtitlePreset: (preset: SubtitlePreset) => void;

  // overlays / audio layers
  addOverlay: (o: Overlay) => void;
  updateOverlay: (id: string, patch: Partial<Overlay>) => void;
  removeOverlay: (id: string) => void;
  addAudioTrack: (a: AudioTrack) => void;
  updateAudioTrack: (id: string, patch: Partial<AudioTrack>) => void;
  removeAudioTrack: (id: string) => void;

  // logo / music / settings
  setLogo: (patch: Partial<LogoState>) => void;
  setMusic: (patch: Partial<MusicState>) => void;
  setSettings: (patch: Partial<ProjectSettings>) => void;
  setAutoEdit: (patch: Partial<AutoEditSettings>) => void;

  // ui
  setActivePanel: (p: PanelId) => void;
  selectClip: (id?: string) => void;
  selectCue: (id?: string) => void;
  setCurrentTime: (t: number) => void;
  seek: (t: number) => void;
  setPlaying: (p: boolean) => void;
  togglePlay: () => void;
  setZoom: (z: number) => void;
  setBusy: (b: { task: string; progress?: number } | null) => void;
  showToast: (kind: "info" | "error" | "success", msg: string) => void;
  setHealth: (h: HealthInfo | null) => void;

  // history
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

const DOC_KEYS: DocKey[] = [
  "clips",
  "subtitles",
  "subtitleStyle",
  "logo",
  "music",
  "overlays",
  "audioTracks",
  "settings",
  "autoEdit",
];

function pickDoc(s: ProjectDoc): ProjectDoc {
  return {
    clips: s.clips,
    subtitles: s.subtitles,
    subtitleStyle: s.subtitleStyle,
    logo: s.logo,
    music: s.music,
    overlays: s.overlays,
    audioTracks: s.audioTracks,
    settings: s.settings,
    autoEdit: s.autoEdit,
  };
}

function cloneDoc(s: ProjectDoc): ProjectDoc {
  return structuredClone(pickDoc(s));
}

export const useEditor = create<StoreState>((set, get) => {
  /** Apply a history-tracked mutation. updater returns a partial doc. */
  const commit = (updater: (s: StoreState) => Partial<ProjectDoc>) =>
    set((state) => {
      const snapshot = cloneDoc(state);
      const next = updater(state);
      return {
        ...next,
        _past: [...state._past, snapshot].slice(-80),
        _future: [],
      } as Partial<StoreState>;
    });

  return {
    // ── document defaults ──
    clips: [],
    subtitles: [],
    subtitleStyle: DEFAULT_SUBTITLE_STYLE,
    logo: DEFAULT_LOGO,
    music: DEFAULT_MUSIC,
    overlays: [],
    audioTracks: [],
    settings: DEFAULT_SETTINGS,
    autoEdit: DEFAULT_AUTOEDIT,

    // ── ui defaults ──
    assets: [],
    activePanel: "media",
    selectedClipId: undefined,
    selectedCueId: undefined,
    currentTime: 0,
    playing: false,
    zoom: 60,
    busy: null,
    toast: null,
    seekNonce: 0,
    health: null,

    _past: [],
    _future: [],

    // ── assets ──
    addAsset: (a) => set((s) => ({ assets: [...s.assets, a] })),
    updateAsset: (id, patch) =>
      set((s) => ({ assets: s.assets.map((a) => (a.id === id ? { ...a, ...patch } : a)) })),
    removeAsset: (id) =>
      commit((s) => ({
        clips: s.clips.filter((c) => c.assetId !== id),
      })),
    reorderAssets: (from, to) => set((s) => ({ assets: moveItem(s.assets, from, to) })),

    // ── timeline ──
    buildAutoTimeline: () =>
      commit((s) => {
        const ready = s.assets.filter((a) => a.kind === "video" && a.status === "ready");
        const clips = buildClipsFromAssets(ready, s.autoEdit, s.settings.transitions);
        return { clips };
      }),
    setClips: (clips) => commit(() => ({ clips })),
    // Direct (no auto-snapshot): used during continuous trim drags. Callers
    // invoke pushHistory() once at the gesture start so undo restores the
    // pre-drag state in one step.
    updateClip: (id, patch) =>
      set((s) => ({ clips: s.clips.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
    splitClipAtSource: (id, sourceTime) =>
      commit((s) => ({ clips: splitClips(s.clips, id, sourceTime) })),
    removeClip: (id) =>
      commit((s) => ({ clips: s.clips.filter((c) => c.id !== id) })),
    moveClip: (from, to) => commit((s) => ({ clips: moveItem(s.clips, from, to) })),
    duplicateClip: (id) =>
      commit((s) => {
        const idx = s.clips.findIndex((c) => c.id === id);
        if (idx < 0) return {};
        const copy = { ...s.clips[idx], id: uid("clip_") };
        const clips = s.clips.slice();
        clips.splice(idx + 1, 0, copy);
        return { clips };
      }),

    // ── subtitles ──
    setSubtitles: (cues) => commit(() => ({ subtitles: cues })),
    addCue: (cue) =>
      commit((s) => ({
        subtitles: [...s.subtitles, cue].sort((a, b) => a.start - b.start),
      })),
    // Direct (no auto-snapshot): typing into a cue. SubtitlesPanel calls
    // pushHistory() once when an edit field gains focus.
    updateCue: (id, patch) =>
      set((s) => ({
        subtitles: s.subtitles.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      })),
    removeCue: (id) => commit((s) => ({ subtitles: s.subtitles.filter((c) => c.id !== id) })),
    // Style/logo/music/settings are direct sets — they're configuration, not
    // structural edits, so they don't crowd the undo stack on every slider tick.
    setSubtitleStyle: (patch) => set((s) => ({ subtitleStyle: { ...s.subtitleStyle, ...patch } })),
    applySubtitlePreset: (preset) =>
      set(() => ({ subtitleStyle: { preset, ...SUBTITLE_PRESETS[preset] } })),

    // ── overlays / audio layers ──
    addOverlay: (o) => commit((s) => ({ overlays: [...s.overlays, o] })),
    updateOverlay: (id, patch) =>
      set((s) => ({ overlays: s.overlays.map((o) => (o.id === id ? { ...o, ...patch } : o)) })),
    removeOverlay: (id) => commit((s) => ({ overlays: s.overlays.filter((o) => o.id !== id) })),
    addAudioTrack: (a) => commit((s) => ({ audioTracks: [...s.audioTracks, a] })),
    updateAudioTrack: (id, patch) =>
      set((s) => ({ audioTracks: s.audioTracks.map((a) => (a.id === id ? { ...a, ...patch } : a)) })),
    removeAudioTrack: (id) => commit((s) => ({ audioTracks: s.audioTracks.filter((a) => a.id !== id) })),

    // ── logo / music / settings ──
    setLogo: (patch) => set((s) => ({ logo: { ...s.logo, ...patch } })),
    setMusic: (patch) => set((s) => ({ music: { ...s.music, ...patch } })),
    setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
    setAutoEdit: (patch) => set((s) => ({ autoEdit: { ...s.autoEdit, ...patch } })),

    // ── ui ──
    setActivePanel: (p) => set({ activePanel: p }),
    selectClip: (id) => set({ selectedClipId: id, selectedCueId: undefined }),
    selectCue: (id) => set({ selectedCueId: id, selectedClipId: undefined }),
    setCurrentTime: (t) => set({ currentTime: Math.max(0, t) }),
    seek: (t) => set((s) => ({ currentTime: Math.max(0, t), seekNonce: s.seekNonce + 1 })),
    setPlaying: (p) => set({ playing: p }),
    togglePlay: () => set((s) => ({ playing: !s.playing })),
    setZoom: (z) => set({ zoom: clamp(z, 8, 400) }),
    setBusy: (b) => set({ busy: b }),
    showToast: (kind, msg) => {
      set({ toast: { kind, msg } });
      setTimeout(() => {
        if (get().toast?.msg === msg) set({ toast: null });
      }, 4200);
    },
    setHealth: (h) => set({ health: h }),

    // ── history ──
    pushHistory: () =>
      set((s) => ({ _past: [...s._past, cloneDoc(s)].slice(-80), _future: [] })),
    undo: () =>
      set((s) => {
        if (!s._past.length) return {};
        const prev = s._past[s._past.length - 1];
        return {
          ...prev,
          _past: s._past.slice(0, -1),
          _future: [cloneDoc(s), ...s._future].slice(0, 80),
        };
      }),
    redo: () =>
      set((s) => {
        if (!s._future.length) return {};
        const next = s._future[0];
        return {
          ...next,
          _future: s._future.slice(1),
          _past: [...s._past, cloneDoc(s)].slice(-80),
        };
      }),
    canUndo: () => get()._past.length > 0,
    canRedo: () => get()._future.length > 0,
  };
});

// Expose the store in development for debugging / automated checks.
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  (window as any).__editor = useEditor;
}

/** Derived selector: the placed timeline. Call inside components with useMemo. */
export function useTimeline() {
  const clips = useEditor((s) => s.clips);
  return buildTimeline(clips);
}

export { DOC_KEYS };
