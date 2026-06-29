"use client";

import { useRef } from "react";
import { ImageIcon, UploadCloud, Trash2 } from "lucide-react";
import { useEditor } from "@/lib/store";
import { uploadFile } from "@/lib/api";
import { uid } from "@/lib/format";
import { PanelHeader, Slider } from "@/components/ui";
import type { LogoPosition, MediaAsset } from "@/lib/types";
import clsx from "clsx";

const POSITIONS: { value: LogoPosition; label: string }[] = [
  { value: "tl", label: "Sol Üst" },
  { value: "tr", label: "Sağ Üst" },
  { value: "center", label: "Orta" },
  { value: "bl", label: "Sol Alt" },
  { value: "br", label: "Sağ Alt" },
];

export default function LogoPanel() {
  const logo = useEditor((s) => s.logo);
  const assets = useEditor((s) => s.assets);
  const addAsset = useEditor((s) => s.addAsset);
  const updateAsset = useEditor((s) => s.updateAsset);
  const setLogo = useEditor((s) => s.setLogo);
  const showToast = useEditor((s) => s.showToast);
  const inputRef = useRef<HTMLInputElement>(null);

  const logoAsset = logo.assetId ? assets.find((a) => a.id === logo.assetId) : undefined;

  const handleFile = async (file: File) => {
    if (!/\.(png|jpg|jpeg|webp|svg)$/i.test(file.name)) {
      showToast("error", "PNG, JPG, WEBP veya SVG yükleyin.");
      return;
    }
    const id = uid("logo_");
    const placeholder: MediaAsset = {
      id,
      name: file.name,
      kind: "image",
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
      setLogo({ assetId: id });
      showToast("success", "Logo eklendi.");
    } catch (e: any) {
      showToast("error", e.message);
    }
  };

  return (
    <div>
      <PanelHeader
        icon={<ImageIcon className="h-4 w-4" />}
        title="Logo"
        subtitle="Şeffaf PNG logonuzu ekleyin; tüm video boyunca görünür kalır."
      />

      {logoAsset?.url ? (
        <div className="mb-3 flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
          <div className="grid h-14 w-14 place-items-center rounded-lg bg-black/30 p-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoAsset.url} alt="logo" className="max-h-full max-w-full object-contain" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-slate-200">{logoAsset.name}</p>
            <p className="text-[10px] text-slate-500">
              {logoAsset.width}×{logoAsset.height}
            </p>
          </div>
          <button
            onClick={() => setLogo({ assetId: undefined })}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-500/15 hover:text-rose-400"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          className="mb-3 flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-white/12 bg-white/[0.015] px-4 py-6 transition-all hover:border-brand-400/50 hover:bg-white/[0.03]"
        >
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-brand-500/15 text-brand-300">
            <UploadCloud className="h-5 w-5" />
          </div>
          <p className="text-sm font-medium text-slate-300">Logo yükle (PNG önerilir)</p>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />

      <div className="space-y-3">
        <div>
          <p className="panel-title mb-2">Konum</p>
          <div className="grid grid-cols-2 gap-1.5">
            {POSITIONS.map((p) => (
              <button
                key={p.value}
                onClick={() => setLogo({ position: p.value })}
                className={clsx(
                  "rounded-lg border px-2 py-2 text-xs font-medium transition-all",
                  logo.position === p.value
                    ? "border-brand-400 bg-brand-500/15 text-white"
                    : "border-white/[0.07] bg-white/[0.02] text-slate-400 hover:bg-white/[0.05]"
                )}
              >
                {p.label}
              </button>
            ))}
            <button
              onClick={() => setLogo({ position: "custom" })}
              className={clsx(
                "col-span-2 rounded-lg border px-2 py-2 text-xs font-medium transition-all",
                logo.position === "custom"
                  ? "border-brand-400 bg-brand-500/15 text-white"
                  : "border-white/[0.07] bg-white/[0.02] text-slate-400 hover:bg-white/[0.05]"
              )}
            >
              Özel konum (kaydırıcılarla)
            </button>
          </div>
        </div>

        {logo.position === "custom" && (
          <>
            <Slider label="Yatay (X)" min={0} max={1} step={0.01} value={logo.x} onChange={(v) => setLogo({ x: v })} format={(v) => `${Math.round(v * 100)}%`} />
            <Slider label="Dikey (Y)" min={0} max={1} step={0.01} value={logo.y} onChange={(v) => setLogo({ y: v })} format={(v) => `${Math.round(v * 100)}%`} />
          </>
        )}

        <Slider label="Boyut" min={0.05} max={0.5} step={0.01} value={logo.scale} onChange={(v) => setLogo({ scale: v })} format={(v) => `${Math.round(v * 100)}%`} />
        <Slider label="Opaklık" min={0.1} max={1} step={0.05} value={logo.opacity} onChange={(v) => setLogo({ opacity: v })} format={(v) => `${Math.round(v * 100)}%`} />
        {logo.position !== "custom" && (
          <Slider label="Kenar boşluğu" min={0} max={0.12} step={0.005} value={logo.margin} onChange={(v) => setLogo({ margin: v })} format={(v) => `${Math.round(v * 100)}%`} />
        )}
      </div>
    </div>
  );
}
