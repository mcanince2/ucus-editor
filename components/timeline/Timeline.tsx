"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Scissors, ZoomIn, ZoomOut, Trash2, Type, Music2, ImageIcon, Volume2, Layers } from "lucide-react";
import { useEditor } from "@/lib/store";
import { buildTimeline, clipAtTime, timelineToSource } from "@/lib/timeline";
import { formatTime } from "@/lib/format";
import clsx from "clsx";

type DragMode = null | { kind: "seek" } | { kind: "trim-l" | "trim-r" | "move"; clipId: string; startX: number };

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

  const setZoom = useEditor((s) => s.setZoom);
  const seek = useEditor((s) => s.seek);
  const selectClip = useEditor((s) => s.selectClip);
  const selectCue = useEditor((s) => s.selectCue);
  const updateClip = useEditor((s) => s.updateClip);
  const moveClip = useEditor((s) => s.moveClip);
  const removeClip = useEditor((s) => s.removeClip);
  const splitClipAtSource = useEditor((s) => s.splitClipAtSource);
  const pushHistory = useEditor((s) => s.pushHistory);

  const timeline = useMemo(() => buildTimeline(clips), [clips]);
  const assetMap = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const tracksRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragMode>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const pxPerSec = zoom;
  const contentWidth = Math.max(800, timeline.duration * pxPerSec + 80);

  // --- helpers ---
  const clientXToTime = (clientX: number) => {
    const el = tracksRef.current;
    if (!el) return 0;
    // tracksRef is the inner content div; its rect already shifts with scroll,
    // so we must NOT add scrollLeft again.
    const rect = el.getBoundingClientRect();
    return Math.max(0, (clientX - rect.left) / pxPerSec);
  };

  // --- global pointer handlers for active drag ---
  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      if (drag.kind === "seek") {
        seek(Math.min(timeline.duration, clientXToTime(e.clientX)));
        return;
      }
      const clip = useEditor.getState().clips.find((c) => c.id === drag.clipId);
      if (!clip) return;
      const asset = assetMap.get(clip.assetId);
      const dxSec = ((e.clientX - drag.startX) / pxPerSec) * (clip.speed || 1);

      if (drag.kind === "trim-l") {
        const newIn = Math.max(0, Math.min(clip.out - 0.15, clip.in + dxSec));
        updateClip(clip.id, { in: newIn });
        setDrag({ ...drag, startX: e.clientX });
      } else if (drag.kind === "trim-r") {
        const maxOut = asset?.duration || clip.out;
        const newOut = Math.min(maxOut, Math.max(clip.in + 0.15, clip.out + dxSec));
        updateClip(clip.id, { out: newOut });
        setDrag({ ...drag, startX: e.clientX });
      } else if (drag.kind === "move") {
        const t = clientXToTime(e.clientX);
        let idx = 0;
        for (const c of timeline.clips) {
          if (t > c.start + c.duration / 2) idx++;
        }
        setDropIndex(idx);
      }
    };
    const onUp = () => {
      if (drag.kind === "move" && dropIndex !== null) {
        const from = clips.findIndex((c) => c.id === drag.clipId);
        if (from >= 0) {
          let to = dropIndex;
          if (to > from) to -= 1;
          if (to !== from) moveClip(from, to);
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
        <button onClick={onSplit} disabled={!selectedClipId} className="btn-soft !py-1.5 text-xs" title="Böl (S)">
          <Scissors className="h-3.5 w-3.5" /> Böl
        </button>
        <button
          onClick={() => selectedClipId && removeClip(selectedClipId)}
          disabled={!selectedClipId}
          className="btn-soft !py-1.5 text-xs"
          title="Sil (Delete)"
        >
          <Trash2 className="h-3.5 w-3.5" /> Sil
        </button>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[11px] text-slate-500">
            {clips.length} klip · {formatTime(timeline.duration)}
          </span>
          <button onClick={() => setZoom(zoom / 1.4)} className="btn-soft h-7 w-7 !px-0" title="Uzaklaş">
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => setZoom(zoom * 1.4)} className="btn-soft h-7 w-7 !px-0" title="Yakınlaş">
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Track labels + scroll area */}
      <div className="flex flex-1 overflow-hidden">
        {/* labels */}
        <div className="w-20 shrink-0 border-r border-white/[0.06] bg-black/20 text-[10px] font-medium text-slate-500">
          <div className="h-6" />
          <TrackLabel icon={<ImageIcon className="h-3 w-3" />} label="Video" h={64} />
          <TrackLabel icon={<Type className="h-3 w-3" />} label="Altyazı" h={26} />
          {overlays.length > 0 && <TrackLabel icon={<Layers className="h-3 w-3" />} label="Katman" h={24} />}
          <TrackLabel icon={<Music2 className="h-3 w-3" />} label="Müzik" h={24} />
          {audioTracks.length > 0 && <TrackLabel icon={<Music2 className="h-3 w-3" />} label="Ses K." h={24} />}
          <TrackLabel icon={<ImageIcon className="h-3 w-3" />} label="Logo" h={18} />
        </div>

        {/* scrollable tracks */}
        <div ref={scrollRef} className="relative flex-1 overflow-x-auto overflow-y-hidden">
          <div ref={tracksRef} className="relative" style={{ width: contentWidth }}>
            {/* ruler */}
            <div
              className="relative h-6 cursor-pointer border-b border-white/[0.06] bg-black/20"
              onPointerDown={(e) => {
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

            {/* VIDEO TRACK */}
            <div
              className="relative h-16 border-b border-white/[0.06] bg-black/10"
              onPointerDown={(e) => {
                if (e.target === e.currentTarget) seek(clientXToTime(e.clientX));
              }}
            >
              {timeline.clips.map((c, i) => {
                const asset = assetMap.get(c.assetId);
                const width = c.duration * pxPerSec;
                const selected = c.id === selectedClipId;
                const prev = timeline.clips[i - 1];
                const cutMark = prev && prev.assetId === c.assetId && Math.abs(prev.out - c.in) > 0.1;
                return (
                  <div
                    key={c.id}
                    className={clsx(
                      "group absolute top-1 bottom-1 overflow-hidden rounded-lg border transition-shadow",
                      selected ? "border-brand-400 shadow-glow z-10" : "border-white/10 hover:border-white/25"
                    )}
                    style={{ left: c.start * pxPerSec, width: Math.max(6, width) }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      selectClip(c.id);
                      setDrag({ kind: "move", clipId: c.id, startX: e.clientX });
                    }}
                  >
                    {asset?.thumbnail && (
                      <div
                        className="absolute inset-0 bg-cover bg-center opacity-55"
                        style={{ backgroundImage: `url(${asset.thumbnail})` }}
                      />
                    )}
                    <div className="absolute inset-0 bg-black/35" />
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
                    <span className="absolute left-1.5 top-1 max-w-[90%] truncate text-[10px] font-medium text-white/90">
                      {asset?.name || "klip"}
                    </span>
                    {/* trim handles */}
                    {selected && (
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
              {drag?.kind === "move" && dropIndex !== null && (
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
            <div className="relative h-[26px] border-b border-white/[0.06] bg-black/10">
              {subtitles.map((cue) => {
                const left = cue.start * pxPerSec;
                const width = Math.max(8, (cue.end - cue.start) * pxPerSec);
                return (
                  <button
                    key={cue.id}
                    onClick={() => {
                      selectCue(cue.id);
                      seek(cue.start + 0.01);
                    }}
                    className={clsx(
                      "absolute top-1 bottom-1 overflow-hidden rounded px-1 text-left text-[9px] leading-tight transition-colors",
                      cue.id === selectedCueId
                        ? "bg-amber-400 text-black"
                        : "bg-amber-400/20 text-amber-200 hover:bg-amber-400/35"
                    )}
                    style={{ left, width }}
                    title={cue.text}
                  >
                    <span className="block truncate">{cue.text}</span>
                  </button>
                );
              })}
            </div>

            {/* OVERLAY TRACK */}
            {overlays.length > 0 && (
              <div className="relative h-6 border-b border-white/[0.06] bg-black/10">
                {overlays.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => seek(o.start + 0.01)}
                    className="absolute inset-y-1 overflow-hidden rounded bg-brand-500/30 px-1.5 text-left text-[9px] text-brand-100 hover:bg-brand-500/45"
                    style={{ left: o.start * pxPerSec, width: Math.max(20, o.duration * pxPerSec) }}
                    title={assetMap.get(o.assetId)?.name}
                  >
                    <span className="truncate">{o.kind === "image" ? "Görsel" : "Video"}</span>
                  </button>
                ))}
              </div>
            )}

            {/* MUSIC TRACK */}
            <div className="relative h-6 border-b border-white/[0.06] bg-black/10">
              {music.source !== "none" && (
                <div
                  className="absolute inset-y-1 left-0 flex items-center gap-1 overflow-hidden rounded bg-emerald-500/20 px-2 text-[9px] text-emerald-200"
                  style={{ width: Math.max(40, timeline.duration * pxPerSec) }}
                >
                  <Volume2 className="h-2.5 w-2.5" />
                  <span className="truncate">{music.name || "Müzik"}</span>
                </div>
              )}
            </div>

            {/* EXTRA AUDIO TRACK */}
            {audioTracks.length > 0 && (
              <div className="relative h-6 border-b border-white/[0.06] bg-black/10">
                {audioTracks.map((t) => (
                  <button
                    key={t.id}
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
            <div className="relative h-[18px]">
              {logo.assetId && (
                <div
                  className="absolute inset-y-0.5 left-0 rounded bg-brand-500/25"
                  style={{ width: Math.max(40, timeline.duration * pxPerSec) }}
                />
              )}
            </div>

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
