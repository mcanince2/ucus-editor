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
  ProjectMeta,
  SavedProject,
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
  /** Primary selection (what the inspector shows). */
  selectedClipId?: string;
  selectedCueId?: string;
  /** Multi-selection (marquee / shift-click). Always contains the primary. */
  selectedClipIds: string[];
  selectedCueIds: string[];
  currentTime: number;
  playing: boolean;
  zoom: number; // pixels per second on the timeline
  busy: { task: string; progress?: number } | null;
  toast: { kind: "info" | "error" | "success"; msg: string } | null;
  /** Bumped on every explicit seek so the player resyncs even mid-playback. */
  seekNonce: number;
  health: HealthInfo | null;
  /** Cloud project this editor state belongs to (saved on the server). */
  project: ProjectMeta;
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

  // multi-select + bulk edits
  selectClips: (ids: string[], primary?: string) => void;
  selectCues: (ids: string[], primary?: string) => void;
  toggleClipSelected: (id: string) => void;
  toggleCueSelected: (id: string) => void;
  clearSelection: () => void;
  removeClips: (ids: string[]) => void;
  removeCues: (ids: string[]) => void;
  /** Move a set of clips (keeping their order) so the block starts at `toIndex`. */
  moveClips: (ids: string[], toIndex: number) => void;
  /** Shift a set of cues in time (clamped at 0). */
  shiftCues: (ids: string[], dt: number) => void;
  /** Delete whatever is selected (clips + cues). */
  deleteSelection: () => void;

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

  // cloud project
  setProject: (patch: Partial<ProjectMeta>) => void;
  /** Replace the whole editor state with a saved project. */
  loadProject: (p: SavedProject) => void;
  /** Start from scratch (keeps the seeded brand logo / music assets). */
  newProject: () => void;

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
    selectedClipIds: [],
    selectedCueIds: [],
    currentTime: 0,
    playing: false,
    zoom: 60,
    busy: null,
    toast: null,
    seekNonce: 0,
    health: null,
    project: { name: "Yeni proje", dirty: false, saving: false, conflict: false },

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
      commit((s) => ({
        clips: s.clips.filter((c) => c.id !== id),
        selectedClipIds: s.selectedClipIds.filter((x) => x !== id),
        selectedClipId: s.selectedClipId === id ? undefined : s.selectedClipId,
      } as Partial<ProjectDoc>)),
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

    // ── multi-select + bulk edits ──
    selectClips: (ids, primary) =>
      set({
        selectedClipIds: ids,
        selectedClipId: primary && ids.includes(primary) ? primary : ids[0],
        selectedCueIds: [],
        selectedCueId: undefined,
      }),
    selectCues: (ids, primary) =>
      set({
        selectedCueIds: ids,
        selectedCueId: primary && ids.includes(primary) ? primary : ids[0],
        selectedClipIds: [],
        selectedClipId: undefined,
      }),
    toggleClipSelected: (id) =>
      set((s) => {
        const ids = s.selectedClipIds.includes(id)
          ? s.selectedClipIds.filter((x) => x !== id)
          : [...s.selectedClipIds, id];
        return { selectedClipIds: ids, selectedClipId: ids.includes(s.selectedClipId || "") ? s.selectedClipId : ids[0], selectedCueIds: [], selectedCueId: undefined };
      }),
    toggleCueSelected: (id) =>
      set((s) => {
        const ids = s.selectedCueIds.includes(id) ? s.selectedCueIds.filter((x) => x !== id) : [...s.selectedCueIds, id];
        return { selectedCueIds: ids, selectedCueId: ids.includes(s.selectedCueId || "") ? s.selectedCueId : ids[0], selectedClipIds: [], selectedClipId: undefined };
      }),
    clearSelection: () =>
      set({ selectedClipIds: [], selectedClipId: undefined, selectedCueIds: [], selectedCueId: undefined }),
    removeClips: (ids) =>
      commit((s) => ({ clips: s.clips.filter((c) => !ids.includes(c.id)) })),
    removeCues: (ids) =>
      commit((s) => ({ subtitles: s.subtitles.filter((c) => !ids.includes(c.id)) })),
    moveClips: (ids, toIndex) =>
      commit((s) => {
        const picked = s.clips.filter((c) => ids.includes(c.id));
        if (!picked.length) return {};
        const rest = s.clips.filter((c) => !ids.includes(c.id));
        // toIndex is an index into the ORIGINAL array; shift it by how many
        // picked clips sat before it.
        const before = s.clips.slice(0, toIndex).filter((c) => ids.includes(c.id)).length;
        const at = clamp(toIndex - before, 0, rest.length);
        rest.splice(at, 0, ...picked);
        return { clips: rest };
      }),
    shiftCues: (ids, dt) =>
      set((s) => {
        const minStart = Math.min(...s.subtitles.filter((c) => ids.includes(c.id)).map((c) => c.start));
        const d = Math.max(dt, -minStart);
        return {
          subtitles: s.subtitles
            .map((c) =>
              ids.includes(c.id)
                ? { ...c, start: c.start + d, end: c.end + d, words: c.words?.map((w) => ({ ...w, start: w.start + d, end: w.end + d })) }
                : c
            )
            .sort((a, b) => a.start - b.start),
        };
      }),
    deleteSelection: () =>
      commit((s) => {
        const clipIds = s.selectedClipIds.length ? s.selectedClipIds : s.selectedClipId ? [s.selectedClipId] : [];
        const cueIds = s.selectedCueIds.length ? s.selectedCueIds : s.selectedCueId ? [s.selectedCueId] : [];
        if (!clipIds.length && !cueIds.length) return {};
        return {
          clips: clipIds.length ? s.clips.filter((c) => !clipIds.includes(c.id)) : s.clips,
          subtitles: cueIds.length ? s.subtitles.filter((c) => !cueIds.includes(c.id)) : s.subtitles,
        };
      }),

    // ── ui ──
    setActivePanel: (p) => set({ activePanel: p }),
    selectClip: (id) =>
      set({ selectedClipId: id, selectedClipIds: id ? [id] : [], selectedCueId: undefined, selectedCueIds: [] }),
    selectCue: (id) =>
      set({ selectedCueId: id, selectedCueIds: id ? [id] : [], selectedClipId: undefined, selectedClipIds: [] }),
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

    // ── cloud project ──
    setProject: (patch) => set((s) => ({ project: { ...s.project, ...patch } })),
    loadProject: (p) =>
      set((s) => {
        const doc = p.doc || ({} as ProjectDoc);
        // Keep brand seeds that may have arrived before the project loaded.
        const seeded = s.assets.filter((a) => (a.id === "ucusbrand" || a.id === "ucusmusic") && !p.assets.some((b) => b.id === a.id));
        return {
          clips: doc.clips || [],
          subtitles: doc.subtitles || [],
          subtitleStyle: doc.subtitleStyle || DEFAULT_SUBTITLE_STYLE,
          logo: doc.logo || DEFAULT_LOGO,
          music: doc.music || DEFAULT_MUSIC,
          overlays: doc.overlays || [],
          audioTracks: doc.audioTracks || [],
          settings: { ...DEFAULT_SETTINGS, ...(doc.settings || {}) },
          autoEdit: { ...DEFAULT_AUTOEDIT, ...(doc.autoEdit || {}) },
          assets: [...p.assets, ...seeded],
          selectedClipId: undefined,
          selectedCueId: undefined,
          currentTime: 0,
          playing: false,
          seekNonce: s.seekNonce + 1,
          project: { id: p.id, name: p.name, updatedAt: p.updatedAt, dirty: false, saving: false, conflict: false },
          _past: [],
          _future: [],
        };
      }),
    newProject: () =>
      set((s) => ({
        clips: [],
        subtitles: [],
        subtitleStyle: DEFAULT_SUBTITLE_STYLE,
        logo: { ...DEFAULT_LOGO, assetId: s.assets.some((a) => a.id === "ucusbrand") ? "ucusbrand" : undefined },
        music: s.assets.some((a) => a.id === "ucusmusic")
          ? { ...DEFAULT_MUSIC, source: "upload", assetId: "ucusmusic", name: "Consumerism Simplified" }
          : DEFAULT_MUSIC,
        overlays: [],
        audioTracks: [],
        settings: DEFAULT_SETTINGS,
        autoEdit: DEFAULT_AUTOEDIT,
        assets: s.assets.filter((a) => a.id === "ucusbrand" || a.id === "ucusmusic"),
        selectedClipId: undefined,
        selectedCueId: undefined,
        currentTime: 0,
        playing: false,
        seekNonce: s.seekNonce + 1,
        project: { name: "Yeni proje", dirty: false, saving: false, conflict: false },
        _past: [],
        _future: [],
      })),

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
