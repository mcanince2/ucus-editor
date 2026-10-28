"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Scissors, ZoomIn, ZoomOut, Trash2, Type, Music2, ImageIcon, Volume2, Layers, Plus, Film, BoxSelect } from "lucide-react";
import { useEditor } from "@/lib/store";
import { buildTimeline, timelineToSource } from "@/lib/timeline";
import { formatTime, uid } from "@/lib/format";
import { uploadFile, watchProxy } from "@/lib/api";
import type { MediaAsset, Overlay } from "@/lib/types";
import clsx from "clsx";

type DragMode =
  | null
  | { kind: "seek" }
  | { kind: "trim-l" | "trim-r"; clipId: string; startX: number }
  /** Moving one or more clips (the whole selection) to a new slot. */
  | { kind: "move"; clipIds: string[]; startX: number; moved: boolean }
  | { kind: "cue-l" | "cue-r"; cueId: string; startX: number }
  /** Dragging one or more cues in time. Becomes a plain click if barely moved. */
  | { kind: "cue-move"; cueId: string; cueIds: string[]; startX: number; moved: boolean; shift: boolean }
  | { kind: "ov-move" | "ov-r"; ovId: string; startX: number }
  /** Rubber-band selection over the tracks. Client coordinates. */
  | { kind: "marquee"; x0: number; y0: number; x1: number; y1: number; additive: boolean; moved: boolean };

export default function Timeline() {
  const clips = useEditor((s) => s.clips);
  const assets = useEditor((s) => s.assets);
  const subtitles = useEditor((s) => s.subtitles);
  const overlays = useEditor((s) => s.overlays);
  const audioTracks = useEditor((s) => s.audioTracks);
  const music = useEditor((s) => s.music);
  const logo = useEditor((s) => s.logo);
  const zoom = useEditor((s) => s.zoom);
  const currentTime = useEditor((s) => s.currentTime);
  const selectedClipId = useEditor((s) => s.selectedClipId);
  const selectedCueId = useEditor((s) => s.selectedCueId);
  const selectedClipIds = useEditor((s) => s.selectedClipIds);
  const selectedCueIds = useEditor((s) => s.selectedCueIds);

  const setZoom = useEditor((s) => s.setZoom);
  const seek = useEditor((s) => s.seek);
  const selectClip = useEditor((s) => s.selectClip);
  const selectCue = useEditor((s) => s.selectCue);
  const selectClips = useEditor((s) => s.selectClips);
  const selectCues = useEditor((s) => s.selectCues);
  const toggleClipSelected = useEditor((s) => s.toggleClipSelected);
  const toggleCueSelected = useEditor((s) => s.toggleCueSelected);
  const clearSelection = useEditor((s) => s.clearSelection);
  const deleteSelection = useEditor((s) => s.deleteSelection);
  const updateClip = useEditor((s) => s.updateClip);
  const updateCue = useEditor((s) => s.updateCue);
  const moveClips = useEditor((s) => s.moveClips);
  const shiftCues = useEditor((s) => s.shiftCues);
  const splitClipAtSource = useEditor((s) => s.splitClipAtSource);
  const pushHistory = useEditor((s) => s.pushHistory);
  const addOverlay = useEditor((s) => s.addOverlay);
  const updateOverlay = useEditor((s) => s.updateOverlay);
  const removeOverlay = useEditor((s) => s.removeOverlay);
  const addAsset = useEditor((s) => s.addAsset);
  const updateAsset = useEditor((s) => s.updateAsset);
  const setActivePanel = useEditor((s) => s.setActivePanel);
  const showToast = useEditor((s) => s.showToast);

  const v2InputRef = useRef<HTMLInputElement>(null);

  // Add a video/image overlay onto the "Video 2" layer (over the main clips).
  const addOverlayFile = async (file: File) => {
    const isImage = /\.(png|jpg|jpeg|webp|svg|gif)$/i.test(file.name);
    const isVideo = /\.(mp4|mov|webm|mkv|m4v)$/i.test(file.name);
    if (!isImage && !isVideo) {
      showToast("error", "Video veya görsel seçin.");
      return;
    }
    const id = uid(isImage ? "img_" : "ovv_");
    const placeholder: MediaAsset = {
      id,
      name: file.name,
      kind: isImage ? "image" : "video",
      url: `/api/media/${id}`,
      size: file.size,
      duration: 0,
      hasAudio: false,
      status: "uploading",
    };
    addAsset(placeholder);
    try {
      const meta = await uploadFile(file, id, () => {});
      updateAsset(id, { ...meta, status: "ready" });
      if (isVideo) watchProxy(id, (patch) => updateAsset(id, patch));
      const dur = isImage
        ? Math.min(5, timeline.duration || 5)
        : Math.min(meta.duration || 5, timeline.duration || meta.duration || 5);
      const ov: Overlay = {
        id: uid("ov_"),
        assetId: id,
        kind: isImage ? "image" : "video",
        start: 0,
        duration: dur,
        x: 0.5,
        y: 0.32,
        scale: 0.42,
        opacity: 1,
        muted: true,
      };
      addOverlay(ov);
      setActivePanel("layers");
      showToast("success", "Üst katman eklendi — boyut/konumu Katmanlar'dan ayarla.");
    } catch (e: any) {
      showToast("error", e.message);
    }
  };

  const timeline = useMemo(() => buildTimeline(clips), [clips]);
  const assetMap = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const tracksRef = useRef<HTMLDivElement>(null);
  const videoTrackRef = useRef<HTMLDivElement>(null);
  const subTrackRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragMode>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const pxPerSec = zoom;
  const contentWidth = Math.max(800, timeline.duration * pxPerSec + 80);

  const selectionCount = selectedClipIds.length + selectedCueIds.length;

  // --- helpers ---
  const clientXToTime = (clientX: number) => {
    const el = tracksRef.current;
    if (!el) return 0;
    // tracksRef is the inner content div; its rect already shifts with scroll,
    // so we must NOT add scrollLeft again.
    const rect = el.getBoundingClientRect();
    return Math.max(0, (clientX - rect.left) / pxPerSec);
  };

  /** Which clips / cues fall inside a client-space rectangle. */
  const hitTest = (x0: number, y0: number, x1: number, y1: number) => {
    const left = Math.min(x0, x1);
    const right = Math.max(x0, x1);
    const top = Math.min(y0, y1);
    const bottom = Math.max(y0, y1);
    const t0 = clientXToTime(left);
    const t1 = clientXToTime(right);
    const overlapsRow = (el: HTMLDivElement | null) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return bottom >= r.top && top <= r.bottom;
    };
    const clipIds = overlapsRow(videoTrackRef.current)
      ? timeline.clips.filter((c) => c.end > t0 && c.start < t1).map((c) => c.id)
      : [];
    const cueIds = overlapsRow(subTrackRef.current)
      ? subtitles.filter((c) => c.end > t0 && c.start < t1).map((c) => c.id)
      : [];
    return { clipIds, cueIds };
  };

  const applyMarquee = (m: Extract<DragMode, { kind: "marquee" }>) => {
    const { clipIds, cueIds } = hitTest(m.x0, m.y0, m.x1, m.y1);
    const st = useEditor.getState();
    const prevClips = m.additive ? st.selectedClipIds : [];
    const prevCues = m.additive ? st.selectedCueIds : [];
    const allClips = Array.from(new Set([...prevClips, ...clipIds]));
    const allCues = Array.from(new Set([...prevCues, ...cueIds]));
    // Clips and cues can't be selected together (different inspectors); the
    // row with more hits wins, clips on a tie.
    if (allClips.length && allClips.length >= allCues.length) selectClips(allClips, st.selectedClipId);
    else if (allCues.length) selectCues(allCues, st.selectedCueId);
    else clearSelection();
  };

  // --- global pointer handlers for active drag ---
  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      if (drag.kind === "seek") {
        seek(Math.min(timeline.duration, clientXToTime(e.clientX)));
        return;
      }
      if (drag.kind === "marquee") {
        const moved = drag.moved || Math.abs(e.clientX - drag.x0) > 4 || Math.abs(e.clientY - drag.y0) > 4;
        const next = { ...drag, x1: e.clientX, y1: e.clientY, moved };
        setDrag(next);
        if (moved) applyMarquee(next);
        return;
      }
      if (drag.kind === "cue-move") {
        const dxPx = e.clientX - drag.startX;
        if (!drag.moved && Math.abs(dxPx) < 4) return;
        if (!drag.moved) pushHistory();
        shiftCues(drag.cueIds, dxPx / pxPerSec);
        setDrag({ ...drag, startX: e.clientX, moved: true });
        return;
      }
      if (drag.kind === "cue-l" || drag.kind === "cue-r") {
        const cue = useEditor.getState().subtitles.find((c) => c.id === drag.cueId);
        if (!cue) return;
        const dx = (e.clientX - drag.startX) / pxPerSec;
        if (drag.kind === "cue-l") {
          updateCue(cue.id, { start: Math.max(0, Math.min(cue.end - 0.15, cue.start + dx)) });
        } else {
          updateCue(cue.id, { end: Math.max(cue.start + 0.15, cue.end + dx) });
        }
        setDrag({ ...drag, startX: e.clientX });
        return;
      }
      if (drag.kind === "ov-move" || drag.kind === "ov-r") {
        const ov = useEditor.getState().overlays.find((o) => o.id === drag.ovId);
        if (!ov) return;
        const dx = (e.clientX - drag.startX) / pxPerSec;
        if (drag.kind === "ov-move") {
          updateOverlay(ov.id, { start: Math.max(0, ov.start + dx) });
        } else {
          updateOverlay(ov.id, { duration: Math.max(0.3, ov.duration + dx) });
        }
        setDrag({ ...drag, startX: e.clientX });
        return;
      }
      if (drag.kind === "move") {
        const moved = drag.moved || Math.abs(e.clientX - drag.startX) > 4;
        if (!moved) return;
        if (!drag.moved) setDrag({ ...drag, moved: true });
        const t = clientXToTime(e.clientX);
        let idx = 0;
        for (const c of timeline.clips) {
          if (t > c.start + c.duration / 2) idx++;
        }
        setDropIndex(idx);
        return;
      }
      if (drag.kind !== "trim-l" && drag.kind !== "trim-r") return;
      const clip = useEditor.getState().clips.find((c) => c.id === drag.clipId);
      if (!clip) return;
      const asset = assetMap.get(clip.assetId);
      const dxSec = ((e.clientX - drag.startX) / pxPerSec) * (clip.speed || 1);

      if (drag.kind === "trim-l") {
        const newIn = Math.max(0, Math.min(clip.out - 0.15, clip.in + dxSec));
        updateClip(clip.id, { in: newIn });
        setDrag({ ...drag, startX: e.clientX });
      } else {
        const maxOut = asset?.duration || clip.out;
        const newOut = Math.min(maxOut, Math.max(clip.in + 0.15, clip.out + dxSec));
        updateClip(clip.id, { out: newOut });
        setDrag({ ...drag, startX: e.clientX });
      }
    };
    const onUp = (e: PointerEvent) => {
      if (drag.kind === "move" && drag.moved && dropIndex !== null) {
        moveClips(drag.clipIds, dropIndex);
      }
      if (drag.kind === "marquee" && !drag.moved) {
        // Plain click on empty track → clear selection + move the playhead.
        if (!drag.additive) clearSelection();
        seek(Math.min(timeline.duration, clientXToTime(e.clientX)));
      }
      if (drag.kind === "cue-move" && !drag.moved) {
        if (drag.shift) toggleCueSelected(drag.cueId);
        else {
          selectCue(drag.cueId);
          const cue = useEditor.getState().subtitles.find((c) => c.id === drag.cueId);
          if (cue) seek(cue.start + 0.01);
        }
      }
      setDrag(null);
      setDropIndex(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, dropIndex, timeline, pxPerSec]);

  const onSplit = () => {
    const id = useEditor.getState().selectedClipId;
    if (!id) return;
    const clip = clips.find((c) => c.id === id);
    if (!clip) return;
    const placed = timeline.clips.find((c) => c.id === id);
    if (!placed) return;
    if (currentTime <= placed.start + 0.05 || currentTime >= placed.end - 0.05) return;
    const srcTime = timelineToSource(placed, currentTime);
    splitClipAtSource(id, srcTime);
  };

  /** Start a rubber-band selection from an empty spot on the tracks. */
  const beginMarquee = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (!target.dataset.bg) return;
    e.preventDefault();
    setDrag({
      kind: "marquee",
      x0: e.clientX,
      y0: e.clientY,
      x1: e.clientX,
      y1: e.clientY,
      additive: e.shiftKey || e.metaKey || e.ctrlKey,
      moved: false,
    });
  };

  // Marquee rectangle in content coordinates (for rendering).
  const marqueeRect = useMemo(() => {
    if (!drag || drag.kind !== "marquee" || !drag.moved || !tracksRef.current) return null;
    const r = tracksRef.current.getBoundingClientRect();
    return {
      left: Math.min(drag.x0, drag.x1) - r.left,
      top: Math.min(drag.y0, drag.y1) - r.top,
      width: Math.abs(drag.x1 - drag.x0),
      height: Math.abs(drag.y1 - drag.y0),
    };
  }, [drag]);

  // ruler ticks
  const tickStep = useMemo(() => {
    const targetPx = 90;
    const sec = targetPx / pxPerSec;
    const steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
    return steps.find((s) => s >= sec) || 600;
  }, [pxPerSec]);
  const ticks: number[] = [];
  for (let t = 0; t <= timeline.duration + tickStep; t += tickStep) ticks.push(t);

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2">
        <button onClick={onSplit} disabled={!selectedClipId} className="btn-soft !py-1.5 text-xs" title="Böl (S veya Ctrl+B)">
          <Scissors className="h-3.5 w-3.5" /> Böl
        </button>
        <button
          onClick={() => {
            deleteSelection();
            clearSelection();
          }}
          disabled={!selectionCount}
          className="btn-soft !py-1.5 text-xs"
          title="Seçilenleri sil (Delete)"
        >
          <Trash2 className="h-3.5 w-3.5" /> Sil{selectionCount > 1 ? ` (${selectionCount})` : ""}
        </button>
        <span className="hidden items-center gap-1 text-[10px] text-slate-500 lg:inline-flex" title="Boş alanda sürükleyerek kare seçim · Shift+tık ekle · ⌘A tümü">
          <BoxSelect className="h-3 w-3" /> Sürükleyerek seç · Shift+tık ekle
        </span>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[11px] text-slate-500">
            {clips.length} klip · {formatTime(timeline.duration)}
            {selectionCount > 0 && <span className="text-brand-300"> · {selectionCount} seçili</span>}
          </span>
          <button onClick={() => setZoom(zoom / 1.4)} className="btn-soft h-7 w-7 !px-0" title="Uzaklaş">
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => setZoom(zoom * 1.4)} className="btn-soft h-7 w-7 !px-0" title="Yakınlaş">
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <input
        ref={v2InputRef}
        type="file"
        accept="video/*,image/*"
        hidden
        onChange={(e) => e.target.files?.[0] && addOverlayFile(e.target.files[0])}
      />

      {/* Track labels + scroll area */}
      <div className="flex flex-1 overflow-hidden">
        {/* labels */}
        <div className="w-20 shrink-0 border-r border-white/[0.06] bg-black/20 text-[10px] font-medium text-slate-500">
          <div className="h-6" />
          <div className="flex items-center gap-1 border-b border-white/[0.04] px-2" style={{ height: 44 }}>
            <Layers className="h-3 w-3" />
            <span className="truncate">Video 2</span>
            <button
              onClick={() => v2InputRef.current?.click()}
              className="ml-auto grid h-5 w-5 place-items-center rounded bg-white/[0.06] text-slate-300 hover:bg-brand-500/30 hover:text-brand-200"
              title="Üste video/görsel ekle"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
          <TrackLabel icon={<ImageIcon className="h-3 w-3" />} label="Video" h={64} />
          <TrackLabel icon={<Type className="h-3 w-3" />} label="Altyazı" h={26} />
          <TrackLabel icon={<Music2 className="h-3 w-3" />} label="Müzik" h={24} />
          {audioTracks.length > 0 && <TrackLabel icon={<Music2 className="h-3 w-3" />} label="Ses K." h={24} />}
          <TrackLabel icon={<ImageIcon className="h-3 w-3" />} label="Logo" h={18} />
        </div>

        {/* scrollable tracks */}
        <div ref={scrollRef} className="relative flex-1 overflow-x-auto overflow-y-hidden">
          <div
            ref={tracksRef}
            className={clsx("relative select-none", drag?.kind === "marquee" && "cursor-crosshair")}
            style={{ width: contentWidth }}
            onPointerDown={beginMarquee}
          >
            {/* ruler */}
            <div
              className="relative h-6 cursor-pointer border-b border-white/[0.06] bg-black/20"
              onPointerDown={(e) => {
                e.stopPropagation();
                seek(Math.min(timeline.duration, clientXToTime(e.clientX)));
                setDrag({ kind: "seek" });
              }}
            >
              {ticks.map((t) => (
                <div key={t} className="absolute top-0 h-full" style={{ left: t * pxPerSec }}>
                  <div className="h-2 w-px bg-white/15" />
                  <span className="absolute left-1 top-1.5 text-[9px] tabular-nums text-slate-500">
                    {formatTime(t)}
                  </span>
                </div>
              ))}
            </div>

            {/* VIDEO 2 (overlay) TRACK — videos/images that sit ON TOP of the main clips */}
            <div className="relative h-11 border-b border-white/[0.06] bg-white/[0.015]" data-bg="1">
              {overlays.length === 0 ? (
                <button
                  onClick={() => v2InputRef.current?.click()}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="absolute inset-1 flex items-center justify-center gap-1.5 rounded-md border border-dashed border-white/12 text-[10px] text-slate-500 hover:border-brand-400/50 hover:text-brand-300"
                >
                  <Plus className="h-3 w-3" /> Üste video/görsel ekle (mevcut videonun üzerine gelir)
                </button>
              ) : (
                overlays.map((o) => {
                  const asset = assetMap.get(o.assetId);
                  const left = o.start * pxPerSec;
                  const w = Math.max(28, o.duration * pxPerSec);
                  return (
                    <div
                      key={o.id}
                      className="group absolute inset-y-1 cursor-grab overflow-hidden rounded-md border border-brand-400/40 bg-brand-500/25"
                      style={{ left, width: w }}
                      title={asset?.name}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        if ((e.target as HTMLElement).dataset.h) return;
                        pushHistory();
                        setDrag({ kind: "ov-move", ovId: o.id, startX: e.clientX });
                      }}
                      onClick={() => {
                        setActivePanel("layers");
                        seek(o.start + 0.01);
                      }}
                    >
                      {asset?.thumbnail && (
                        <div className="absolute inset-0 bg-cover bg-center opacity-50" style={{ backgroundImage: `url(${asset.thumbnail})` }} />
                      )}
                      <span className="relative flex h-full items-center gap-1 px-1.5 text-[9px] text-brand-50">
                        {o.kind === "image" ? <ImageIcon className="h-2.5 w-2.5" /> : <Film className="h-2.5 w-2.5" />}
                        <span className="truncate">{asset?.name || (o.kind === "image" ? "Görsel" : "Video")}</span>
                      </span>
                      <div
                        data-h="1"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          pushHistory();
                          setDrag({ kind: "ov-r", ovId: o.id, startX: e.clientX });
                        }}
                        className="absolute right-0 top-0 bottom-0 z-20 w-1.5 cursor-ew-resize bg-brand-300/70 opacity-0 group-hover:opacity-100"
                      />
                      <button
                        data-h="1"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeOverlay(o.id);
                        }}
                        className="absolute right-1 top-0.5 z-30 rounded bg-black/50 p-0.5 text-rose-300 opacity-0 group-hover:opacity-100"
                        title="Kaldır"
                      >
                        <Trash2 className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* VIDEO TRACK */}
            <div ref={videoTrackRef} className="relative h-16 border-b border-white/[0.06] bg-black/10" data-bg="1">
              {timeline.clips.map((c, i) => {
                const asset = assetMap.get(c.assetId);
                const width = c.duration * pxPerSec;
                const selected = selectedClipIds.includes(c.id);
                const primary = c.id === selectedClipId;
                const prev = timeline.clips[i - 1];
                const cutMark = prev && prev.assetId === c.assetId && Math.abs(prev.out - c.in) > 0.1;
                const dragging = drag?.kind === "move" && drag.moved && drag.clipIds.includes(c.id);
                return (
                  <div
                    key={c.id}
                    className={clsx(
                      "group absolute top-1 bottom-1 overflow-hidden rounded-lg border transition-shadow",
                      selected ? "border-brand-400 z-10" : "border-white/10 hover:border-white/25",
                      primary && "shadow-glow",
                      dragging && "opacity-50"
                    )}
                    style={{ left: c.start * pxPerSec, width: Math.max(6, width) }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      if (e.button !== 0) return;
                      const st = useEditor.getState();
                      if (e.shiftKey || e.metaKey || e.ctrlKey) {
                        toggleClipSelected(c.id);
                        return;
                      }
                      const ids = st.selectedClipIds.includes(c.id) ? st.selectedClipIds : [c.id];
                      if (!st.selectedClipIds.includes(c.id)) selectClip(c.id);
                      else if (st.selectedClipId !== c.id) selectClips(ids, c.id);
                      setDrag({ kind: "move", clipIds: ids, startX: e.clientX, moved: false });
                    }}
                  >
                    {asset?.thumbnail && (
                      <div
                        className="absolute inset-0 bg-cover bg-center opacity-55"
                        style={{ backgroundImage: `url(${asset.thumbnail})` }}
                      />
                    )}
                    <div className={clsx("absolute inset-0", selected ? "bg-brand-500/25" : "bg-black/35")} />
                    {asset?.waveform && asset.waveform.length > 0 && (
                      <ClipWaveform
                        waveform={asset.waveform}
                        srcDuration={asset.duration}
                        inT={c.in}
                        outT={c.out}
                        width={Math.max(6, width)}
                      />
                    )}
                    {cutMark && (
                      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-rose-500/80" title="Sessizlik kesildi">
                        <Scissors className="absolute -left-1 top-1 h-2.5 w-2.5 text-rose-300" />
                      </div>
                    )}
                    <span className="absolute left-1 top-1 z-[5] grid h-4 min-w-[16px] place-items-center rounded-full bg-brand-500/80 px-1 text-[9px] font-bold tabular-nums text-white">
                      {i + 1}
                    </span>
                    <span className="absolute left-6 top-1 max-w-[70%] truncate text-[10px] font-medium text-white/90">
                      {asset?.name || "klip"}
                    </span>
                    {/* trim handles (primary selection only) */}
                    {primary && selectedClipIds.length === 1 && (
                      <>
                        <div
                          className="absolute left-0 top-0 bottom-0 z-20 w-2 cursor-ew-resize bg-brand-400/80"
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            pushHistory();
                            setDrag({ kind: "trim-l", clipId: c.id, startX: e.clientX });
                          }}
                        />
                        <div
                          className="absolute right-0 top-0 bottom-0 z-20 w-2 cursor-ew-resize bg-brand-400/80"
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            pushHistory();
                            setDrag({ kind: "trim-r", clipId: c.id, startX: e.clientX });
                          }}
                        />
                      </>
                    )}
                  </div>
                );
              })}
              {/* drop indicator */}
              {drag?.kind === "move" && drag.moved && dropIndex !== null && (
                <div
                  className="absolute top-0 bottom-0 z-30 w-0.5 bg-brand-300"
                  style={{
                    left:
                      (dropIndex >= timeline.clips.length
                        ? timeline.duration
                        : timeline.clips[dropIndex].start) * pxPerSec,
                  }}
                />
              )}
            </div>

            {/* SUBTITLE TRACK */}
            <div ref={subTrackRef} className="relative h-[26px] border-b border-white/[0.06] bg-black/10" data-bg="1">
              {subtitles.map((cue) => {
                const left = cue.start * pxPerSec;
                const width = Math.max(10, (cue.end - cue.start) * pxPerSec);
                const selected = selectedCueIds.includes(cue.id);
                const primary = cue.id === selectedCueId;
                return (
                  <div
                    key={cue.id}
                    className={clsx(
                      "group absolute top-1 bottom-1 overflow-hidden rounded text-[9px] leading-tight transition-colors",
                      selected
                        ? primary
                          ? "bg-amber-400 text-black ring-1 ring-amber-200"
                          : "bg-amber-300/80 text-black ring-1 ring-amber-200/70"
                        : "bg-amber-400/20 text-amber-200 hover:bg-amber-400/35"
                    )}
                    style={{ left, width }}
                    title={cue.text}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      if (e.button !== 0) return;
                      const st = useEditor.getState();
                      const ids = st.selectedCueIds.includes(cue.id) ? st.selectedCueIds : [cue.id];
                      setDrag({
                        kind: "cue-move",
                        cueId: cue.id,
                        cueIds: ids,
                        startX: e.clientX,
                        moved: false,
                        shift: e.shiftKey || e.metaKey || e.ctrlKey,
                      });
                    }}
                  >
                    <span className="absolute inset-0 block cursor-grab truncate px-1.5">{cue.text}</span>
                    {/* trim handles — drag to shorten/extend the cue */}
                    <div
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        pushHistory();
                        setDrag({ kind: "cue-l", cueId: cue.id, startX: e.clientX });
                      }}
                      className="absolute left-0 top-0 bottom-0 z-20 w-1.5 cursor-ew-resize bg-amber-500/70 opacity-0 group-hover:opacity-100"
                    />
                    <div
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        pushHistory();
                        setDrag({ kind: "cue-r", cueId: cue.id, startX: e.clientX });
                      }}
                      className="absolute right-0 top-0 bottom-0 z-20 w-1.5 cursor-ew-resize bg-amber-500/70 opacity-0 group-hover:opacity-100"
                    />
                  </div>
                );
              })}
            </div>

            {/* MUSIC TRACK */}
            <div className="relative h-6 border-b border-white/[0.06] bg-black/10" data-bg="1">
              {music.source !== "none" && (
                <div
                  className="pointer-events-none absolute inset-y-1 left-0 flex items-center gap-1 overflow-hidden rounded bg-emerald-500/20 px-2 text-[9px] text-emerald-200"
                  style={{ width: Math.max(40, timeline.duration * pxPerSec) }}
                >
                  <Volume2 className="h-2.5 w-2.5" />
                  <span className="truncate">{music.name || "Müzik"}</span>
                </div>
              )}
            </div>

            {/* EXTRA AUDIO TRACK */}
            {audioTracks.length > 0 && (
              <div className="relative h-6 border-b border-white/[0.06] bg-black/10" data-bg="1">
                {audioTracks.map((t) => (
                  <button
                    key={t.id}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => seek(t.start + 0.01)}
                    className="absolute inset-y-1 flex items-center gap-1 overflow-hidden rounded bg-emerald-500/25 px-1.5 text-left text-[9px] text-emerald-100 hover:bg-emerald-500/40"
                    style={{ left: t.start * pxPerSec, width: Math.max(40, (timeline.duration - t.start) * pxPerSec) }}
                    title={t.name}
                  >
                    <Volume2 className="h-2.5 w-2.5 shrink-0" />
                    <span className="truncate">{t.name || "Ses"}</span>
                  </button>
                ))}
              </div>
            )}

            {/* LOGO TRACK */}
            <div className="relative h-[18px]" data-bg="1">
              {logo.assetId && (
                <div
                  className="pointer-events-none absolute inset-y-0.5 left-0 rounded bg-brand-500/25"
                  style={{ width: Math.max(40, timeline.duration * pxPerSec) }}
                />
              )}
            </div>

            {/* MARQUEE */}
            {marqueeRect && (
              <div
                className="pointer-events-none absolute z-50 rounded-sm border border-brand-300 bg-brand-400/15"
                style={marqueeRect}
              />
            )}

            {/* PLAYHEAD */}
            <div
              className="pointer-events-none absolute top-0 bottom-0 z-40 w-px bg-white"
              style={{ left: currentTime * pxPerSec }}
            >
              <div className="absolute -left-[5px] -top-0 h-2.5 w-2.5 rounded-sm bg-white" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TrackLabel({ icon, label, h }: { icon: React.ReactNode; label: string; h: number }) {
  return (
    <div
      className="flex items-center gap-1.5 border-b border-white/[0.04] px-2"
      style={{ height: h }}
    >
      {icon}
      <span className="truncate">{label}</span>
    </div>
  );
}

function ClipWaveform({
  waveform,
  srcDuration,
  inT,
  outT,
  width,
}: {
  waveform: number[];
  srcDuration: number;
  inT: number;
  outT: number;
  width: number;
}) {
  const startIdx = Math.floor((inT / srcDuration) * waveform.length);
  const endIdx = Math.ceil((outT / srcDuration) * waveform.length);
  const slice = waveform.slice(Math.max(0, startIdx), Math.max(startIdx + 1, endIdx));
  const bars = Math.max(2, Math.min(slice.length, Math.floor(width / 2)));
  const step = slice.length / bars;
  const points: number[] = [];
  for (let i = 0; i < bars; i++) {
    points.push(slice[Math.floor(i * step)] ?? 0);
  }
  return (
    <svg className="absolute inset-x-0 bottom-0 h-5 w-full" preserveAspectRatio="none" viewBox={`0 0 ${bars} 20`}>
      {points.map((p, i) => {
        const h = Math.max(0.6, p * 18);
        return <rect key={i} x={i + 0.15} y={20 - h} width={0.7} height={h} className="fill-white/40" />;
      })}
    </svg>
  );
}
