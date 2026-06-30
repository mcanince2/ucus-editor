"use client";

import { useRef, useState } from "react";
import { UploadCloud, Trash2, GripVertical, Film, Loader2, AlertCircle, Wand2 } from "lucide-react";
import { useEditor } from "@/lib/store";
import { uploadFile } from "@/lib/api";
import { uid, formatBytes, formatTime } from "@/lib/format";
import { ACCEPTED_VIDEO } from "@/lib/constants";
import { PanelHeader, EmptyHint } from "@/components/ui";
import type { MediaAsset } from "@/lib/types";
import clsx from "clsx";

export default function MediaPanel() {
  const assets = useEditor((s) => s.assets);
  const addAsset = useEditor((s) => s.addAsset);
  const updateAsset = useEditor((s) => s.updateAsset);
  const removeAsset = useEditor((s) => s.removeAsset);
  const reorderAssets = useEditor((s) => s.reorderAssets);
  const setActivePanel = useEditor((s) => s.setActivePanel);
  const showToast = useEditor((s) => s.showToast);

  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const dragIdx = useRef<number | null>(null);

  const videos = assets.filter((a) => a.kind !== "image" && a.kind !== "audio");

  const handleFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) =>
      ACCEPTED_VIDEO.some((ext) => f.name.toLowerCase().endsWith(ext))
    );
    if (!list.length) {
      showToast("error", "Desteklenen video bulunamadı (MP4, MOV, WEBM).");
      return;
    }
    for (const file of list) {
      const id = uid("vid_");
      const placeholder: MediaAsset = {
        id,
        name: file.name,
        kind: "video",
        url: `/api/media/${id}`,
        size: file.size,
        duration: 0,
        hasAudio: true,
        status: "uploading",
        progress: 0,
      };
      addAsset(placeholder);
      try {
        const meta = await uploadFile(file, id, (pct) => updateAsset(id, { progress: pct }));
        updateAsset(id, { ...meta, status: "ready", progress: 100 });
      } catch (e: any) {
        updateAsset(id, { status: "error", error: e.message });
        showToast("error", `${file.name}: ${e.message}`);
      }
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
  };

  const onReorderDrop = (toIdx: number) => {
    const from = dragIdx.current;
    if (from === null || from === toIdx) return;
    reorderAssets(from, toIdx);
    dragIdx.current = null;
  };

  return (
    <div>
      <PanelHeader
        icon={<Film className="h-4 w-4" />}
        title="Medya"
        subtitle="8–10 ham klibi sürükleyip bırakın. Sıralamayı buradan ayarlayabilirsiniz."
      />

      <button
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={clsx(
          "group flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-4 py-7 text-center transition-all",
          over ? "border-brand-400 bg-brand-500/10" : "border-white/12 bg-white/[0.015] hover:border-brand-400/50 hover:bg-white/[0.03]"
        )}
      >
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-500/15 text-brand-300 transition-transform group-hover:scale-110">
          <UploadCloud className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-medium text-slate-200">Klipleri buraya bırakın</p>
          <p className="mt-0.5 text-xs text-slate-500">veya tıklayıp seçin · MP4 · MOV · WEBM</p>
        </div>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="video/*,.mov,.mp4,.webm,.mkv,.m4v"
        multiple
        hidden
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
      />

      <div className="mt-4 space-y-2">
        {videos.length === 0 && (
          <EmptyHint title="Henüz klip yok">Yüklediğiniz klipler burada listelenir.</EmptyHint>
        )}
        {videos.map((a, i) => (
          <div
            key={a.id}
            draggable
            onDragStart={() => (dragIdx.current = i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onReorderDrop(i)}
            className="group flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2 transition-colors hover:border-white/15"
          >
            <div className="flex shrink-0 cursor-grab flex-col items-center gap-0.5">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-brand-500/20 text-[10px] font-bold tabular-nums text-brand-200">
                {i + 1}
              </span>
              <GripVertical className="h-3.5 w-3.5 text-slate-600" />
            </div>
            <div className="relative h-12 w-[72px] shrink-0 overflow-hidden rounded-lg bg-black">
              {a.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.thumbnail} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full w-full place-items-center">
                  {a.status === "uploading" ? (
                    <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
                  ) : (
                    <Film className="h-4 w-4 text-slate-600" />
                  )}
                </div>
              )}
              {a.status === "ready" && a.duration > 0 && (
                <span className="absolute bottom-0.5 right-0.5 rounded bg-black/70 px-1 text-[9px] tabular-nums text-white">
                  {formatTime(a.duration)}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-slate-200">{a.name}</p>
              {a.status === "uploading" ? (
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full bg-brand-400 transition-all" style={{ width: `${a.progress || 0}%` }} />
                </div>
              ) : a.status === "error" ? (
                <p className="mt-0.5 flex items-center gap-1 text-[10px] text-rose-400">
                  <AlertCircle className="h-3 w-3" /> {a.error || "Hata"}
                </p>
              ) : (
                <p className="mt-0.5 text-[10px] text-slate-500">
                  {a.width}×{a.height} · {formatBytes(a.size)}
                  {!a.hasAudio && " · ses yok"}
                </p>
              )}
            </div>
            <button
              onClick={() => removeAsset(a.id)}
              className="shrink-0 rounded-lg p-1.5 text-slate-500 opacity-0 transition-all hover:bg-rose-500/15 hover:text-rose-400 group-hover:opacity-100"
              title="Sil"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      {videos.some((a) => a.status === "ready") && (
        <button onClick={() => setActivePanel("auto")} className="btn-primary mt-4 w-full">
          <Wand2 className="h-4 w-4" /> Otomatik Kurguya Geç
        </button>
      )}
    </div>
  );
}
