"use client";

import { useMemo, useRef } from "react";
import { Layers, Film, ImageIcon, Music2, Trash2, Plus } from "lucide-react";
import { useEditor } from "@/lib/store";
import { uploadFile } from "@/lib/api";
import { buildTimeline } from "@/lib/timeline";
import { uid, formatTime } from "@/lib/format";
import { PanelHeader, Slider, EmptyHint } from "@/components/ui";
import type { MediaAsset, Overlay, AudioTrack } from "@/lib/types";

export default function LayersPanel() {
  const overlays = useEditor((s) => s.overlays);
  const audioTracks = useEditor((s) => s.audioTracks);
  const clips = useEditor((s) => s.clips);
  const assets = useEditor((s) => s.assets);
  const addAsset = useEditor((s) => s.addAsset);
  const updateAsset = useEditor((s) => s.updateAsset);
  const addOverlay = useEditor((s) => s.addOverlay);
  const updateOverlay = useEditor((s) => s.updateOverlay);
  const removeOverlay = useEditor((s) => s.removeOverlay);
  const addAudioTrack = useEditor((s) => s.addAudioTrack);
  const updateAudioTrack = useEditor((s) => s.updateAudioTrack);
  const removeAudioTrack = useEditor((s) => s.removeAudioTrack);
  const showToast = useEditor((s) => s.showToast);

  const visualRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLInputElement>(null);

  const duration = useMemo(() => buildTimeline(clips).duration || 8, [clips]);
  const assetName = (id: string) => assets.find((a) => a.id === id)?.name || "katman";

  const addVisual = async (file: File) => {
    const isImage = /\.(png|jpg|jpeg|webp|svg|gif)$/i.test(file.name);
    const isVideo = /\.(mp4|mov|webm|mkv|m4v)$/i.test(file.name);
    if (!isImage && !isVideo) {
      showToast("error", "Video veya görsel yükleyin.");
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
      const meta = await uploadFile(file, id, (p) => updateAsset(id, { progress: p }));
      updateAsset(id, { ...meta, status: "ready" });
      const dur = isImage ? Math.min(5, duration) : Math.min(meta.duration || 5, duration);
      const overlay: Overlay = {
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
      addOverlay(overlay);
      showToast("success", "Katman eklendi.");
    } catch (e: any) {
      showToast("error", e.message);
    }
  };

  const addAudio = async (file: File) => {
    if (!/\.(mp3|wav|m4a|aac|ogg)$/i.test(file.name)) {
      showToast("error", "Ses dosyası yükleyin (MP3, WAV, M4A).");
      return;
    }
    const id = uid("trk_");
    const placeholder: MediaAsset = {
      id,
      name: file.name,
      kind: "audio",
      url: `/api/media/${id}`,
      size: file.size,
      duration: 0,
      hasAudio: true,
      status: "uploading",
    };
    addAsset(placeholder);
    try {
      const meta = await uploadFile(file, id, (p) => updateAsset(id, { progress: p }));
      updateAsset(id, { ...meta, status: "ready" });
      const track: AudioTrack = {
        id: uid("at_"),
        assetId: id,
        name: file.name,
        start: 0,
        volume: 0.85,
        fadeIn: 0.3,
        fadeOut: 0.5,
      };
      addAudioTrack(track);
      showToast("success", "Ses katmanı eklendi.");
    } catch (e: any) {
      showToast("error", e.message);
    }
  };

  return (
    <div>
      <PanelHeader
        icon={<Layers className="h-4 w-4" />}
        title="Katmanlar"
        subtitle="Ana videonun üzerine ekstra video/görsel katmanı veya ses (seslendirme, efekt) ekleyin."
      />

      {/* Add buttons */}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => visualRef.current?.click()} className="btn-ghost text-xs">
          <Plus className="h-3.5 w-3.5" /> Video / Görsel
        </button>
        <button onClick={() => audioRef.current?.click()} className="btn-ghost text-xs">
          <Plus className="h-3.5 w-3.5" /> Ses katmanı
        </button>
      </div>
      <input ref={visualRef} type="file" accept="video/*,image/*" hidden onChange={(e) => e.target.files?.[0] && addVisual(e.target.files[0])} />
      <input ref={audioRef} type="file" accept="audio/*" hidden onChange={(e) => e.target.files?.[0] && addAudio(e.target.files[0])} />

      {/* Visual overlays */}
      <p className="panel-title mb-2 mt-4">Görsel katmanlar ({overlays.length})</p>
      {overlays.length === 0 ? (
        <EmptyHint title="Görsel katman yok">PIP video veya logo/görsel ekleyin.</EmptyHint>
      ) : (
        <div className="space-y-2">
          {overlays.map((o) => (
            <div key={o.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
              <div className="mb-2 flex items-center gap-2">
                {o.kind === "image" ? <ImageIcon className="h-3.5 w-3.5 text-brand-300" /> : <Film className="h-3.5 w-3.5 text-brand-300" />}
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-200">{assetName(o.assetId)}</span>
                <button onClick={() => removeOverlay(o.id)} className="rounded p-1 text-slate-500 hover:text-rose-400">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="space-y-2">
                <Slider label="Boyut" min={0.1} max={1} step={0.02} value={o.scale} onChange={(v) => updateOverlay(o.id, { scale: v })} format={(v) => `${Math.round(v * 100)}%`} />
                <div className="grid grid-cols-2 gap-2">
                  <Slider label="Yatay" min={0} max={1} step={0.01} value={o.x} onChange={(v) => updateOverlay(o.id, { x: v })} format={(v) => `${Math.round(v * 100)}`} />
                  <Slider label="Dikey" min={0} max={1} step={0.01} value={o.y} onChange={(v) => updateOverlay(o.id, { y: v })} format={(v) => `${Math.round(v * 100)}`} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Slider label="Başlangıç" min={0} max={Math.max(1, duration)} step={0.1} value={o.start} onChange={(v) => updateOverlay(o.id, { start: v })} format={formatTime} />
                  <Slider label="Süre" min={0.5} max={Math.max(1, duration)} step={0.1} value={o.duration} onChange={(v) => updateOverlay(o.id, { duration: v })} format={formatTime} />
                </div>
                <Slider label="Opaklık" min={0.1} max={1} step={0.05} value={o.opacity} onChange={(v) => updateOverlay(o.id, { opacity: v })} format={(v) => `${Math.round(v * 100)}%`} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Audio tracks */}
      <p className="panel-title mb-2 mt-4">Ses katmanları ({audioTracks.length})</p>
      {audioTracks.length === 0 ? (
        <EmptyHint title="Ses katmanı yok">Seslendirme veya efekt sesi ekleyin.</EmptyHint>
      ) : (
        <div className="space-y-2">
          {audioTracks.map((t) => (
            <div key={t.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
              <div className="mb-2 flex items-center gap-2">
                <Music2 className="h-3.5 w-3.5 text-emerald-300" />
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-200">{t.name || assetName(t.assetId)}</span>
                <button onClick={() => removeAudioTrack(t.id)} className="rounded p-1 text-slate-500 hover:text-rose-400">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="space-y-2">
                <Slider label="Ses seviyesi" min={0} max={1} step={0.02} value={t.volume} onChange={(v) => updateAudioTrack(t.id, { volume: v })} format={(v) => `${Math.round(v * 100)}%`} />
                <Slider label="Başlangıç" min={0} max={Math.max(1, duration)} step={0.1} value={t.start} onChange={(v) => updateAudioTrack(t.id, { start: v })} format={formatTime} />
                <div className="grid grid-cols-2 gap-2">
                  <Slider label="Açılış" min={0} max={4} step={0.1} value={t.fadeIn} onChange={(v) => updateAudioTrack(t.id, { fadeIn: v })} format={(v) => `${v.toFixed(1)}s`} />
                  <Slider label="Kapanış" min={0} max={4} step={0.1} value={t.fadeOut} onChange={(v) => updateAudioTrack(t.id, { fadeOut: v })} format={(v) => `${v.toFixed(1)}s`} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
