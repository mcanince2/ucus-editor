"use client";

import { useEffect, useRef, useState } from "react";
import { Music2, UploadCloud, Play, Pause, Check, X } from "lucide-react";
import { useEditor } from "@/lib/store";
import { fetchMusic, uploadFile } from "@/lib/api";
import { uid } from "@/lib/format";
import { PanelHeader, Slider, Toggle } from "@/components/ui";
import type { BuiltinTrack, MediaAsset } from "@/lib/types";
import clsx from "clsx";

export default function MusicPanel() {
  const music = useEditor((s) => s.music);
  const setMusic = useEditor((s) => s.setMusic);
  const addAsset = useEditor((s) => s.addAsset);
  const updateAsset = useEditor((s) => s.updateAsset);
  const showToast = useEditor((s) => s.showToast);

  const [tracks, setTracks] = useState<BuiltinTrack[]>([]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const previewRef = useRef<HTMLAudioElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchMusic().then(setTracks).catch(() => {});
    return () => previewRef.current?.pause();
  }, []);

  const togglePreview = (t: BuiltinTrack) => {
    if (previewId === t.id) {
      previewRef.current?.pause();
      setPreviewId(null);
      return;
    }
    previewRef.current?.pause();
    const a = new Audio(t.url);
    a.volume = 0.5;
    a.play().catch(() => {});
    previewRef.current = a;
    setPreviewId(t.id);
    a.onended = () => setPreviewId(null);
  };

  const handleUpload = async (file: File) => {
    if (!/\.(mp3|wav|m4a|aac|ogg)$/i.test(file.name)) {
      showToast("error", "MP3, WAV, M4A veya OGG yükleyin.");
      return;
    }
    const id = uid("aud_");
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
      const meta = await uploadFile(file, id, () => {});
      updateAsset(id, { ...meta, status: "ready" });
      setMusic({ source: "upload", assetId: id, name: file.name });
      showToast("success", "Müzik eklendi.");
    } catch (e: any) {
      showToast("error", e.message);
    }
  };

  return (
    <div>
      <PanelHeader
        icon={<Music2 className="h-4 w-4" />}
        title="Müzik"
        subtitle="Hazır parçalardan seçin veya kendi müziğinizi yükleyin. Konuşma sırasında otomatik kısılır."
      />

      <div className="mb-3 flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
        <span className="text-xs text-slate-300">
          {music.source === "none" ? "Müzik kapalı" : music.name || "Seçili parça"}
        </span>
        {music.source !== "none" && (
          <button onClick={() => setMusic({ source: "none", assetId: undefined, builtinId: undefined, name: undefined })} className="rounded-md p-1 text-slate-500 hover:text-rose-400" title="Kaldır">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <p className="panel-title mb-2">Hazır kütüphane</p>
      <div className="space-y-1.5">
        {tracks.map((t) => {
          const selected = music.source === "builtin" && music.builtinId === t.id;
          return (
            <div
              key={t.id}
              className={clsx(
                "flex items-center gap-2 rounded-xl border p-2 transition-colors",
                selected ? "border-emerald-400/50 bg-emerald-400/[0.06]" : "border-white/[0.06] bg-white/[0.02]"
              )}
            >
              <button onClick={() => togglePreview(t)} className="grid h-8 w-8 place-items-center rounded-lg bg-white/[0.05] text-slate-300 hover:bg-white/[0.1]">
                {previewId === t.id ? <Pause className="h-3.5 w-3.5" /> : <Play className="ml-0.5 h-3.5 w-3.5" />}
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-slate-200">{t.name}</p>
                <p className="text-[10px] text-slate-500">{t.mood}</p>
              </div>
              <button
                onClick={() => setMusic({ source: "builtin", builtinId: t.id, name: t.name, assetId: undefined })}
                className={clsx(
                  "rounded-lg px-2.5 py-1 text-[11px] font-medium",
                  selected ? "bg-emerald-500 text-white" : "bg-white/[0.06] text-slate-300 hover:bg-white/[0.12]"
                )}
              >
                {selected ? <Check className="h-3.5 w-3.5" /> : "Seç"}
              </button>
            </div>
          );
        })}
      </div>

      <button onClick={() => inputRef.current?.click()} className="btn-ghost mt-3 w-full text-xs">
        <UploadCloud className="h-3.5 w-3.5" /> Kendi müziğini yükle
      </button>
      <input ref={inputRef} type="file" accept="audio/*" hidden onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} />

      {music.source !== "none" && (
        <div className="mt-4 space-y-3 rounded-xl border border-white/[0.06] bg-white/[0.015] p-3">
          <Slider label="Müzik seviyesi" min={0} max={1} step={0.02} value={music.volume} onChange={(v) => setMusic({ volume: v })} format={(v) => `${Math.round(v * 100)}%`} />
          <Toggle
            label="Konuşmada otomatik kıs (ducking)"
            hint="Konuşma varken müzik seviyesini düşürür."
            checked={music.duck}
            onChange={(v) => setMusic({ duck: v })}
          />
          {music.duck && (
            <Slider label="Kısılmış seviye" min={0.02} max={0.5} step={0.02} value={music.duckAmount} onChange={(v) => setMusic({ duckAmount: v })} format={(v) => `${Math.round(v * 100)}%`} />
          )}
          <Slider label="Açılış (fade in)" min={0} max={4} step={0.1} value={music.fadeIn} onChange={(v) => setMusic({ fadeIn: v })} format={(v) => `${v.toFixed(1)}s`} />
          <Slider label="Kapanış (fade out)" min={0} max={4} step={0.1} value={music.fadeOut} onChange={(v) => setMusic({ fadeOut: v })} format={(v) => `${v.toFixed(1)}s`} />
          <Toggle label="Döngü (loop)" hint="Video müzikten uzunsa müziği tekrar eder." checked={music.loop} onChange={(v) => setMusic({ loop: v })} />
        </div>
      )}
    </div>
  );
}
