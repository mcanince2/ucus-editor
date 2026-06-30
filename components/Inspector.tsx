"use client";

import { useMemo } from "react";
import { Settings2, Gauge, VolumeX, Volume2, Copy, Trash2, Scissors, Captions, Layers } from "lucide-react";
import { useEditor } from "@/lib/store";
import { buildTimeline, clipDuration, timelineToSource } from "@/lib/timeline";
import { ASPECT_PRESETS } from "@/lib/constants";
import { formatTime } from "@/lib/format";
import { PanelHeader, Slider, Field, Select } from "@/components/ui";
import type { TransitionType } from "@/lib/types";

export default function Inspector() {
  const clips = useEditor((s) => s.clips);
  const assets = useEditor((s) => s.assets);
  const subtitles = useEditor((s) => s.subtitles);
  const selectedClipId = useEditor((s) => s.selectedClipId);
  const selectedCueId = useEditor((s) => s.selectedCueId);
  const settings = useEditor((s) => s.settings);
  const currentTime = useEditor((s) => s.currentTime);

  const updateClip = useEditor((s) => s.updateClip);
  const removeClip = useEditor((s) => s.removeClip);
  const duplicateClip = useEditor((s) => s.duplicateClip);
  const splitClipAtSource = useEditor((s) => s.splitClipAtSource);
  const updateCue = useEditor((s) => s.updateCue);
  const removeCue = useEditor((s) => s.removeCue);
  const pushHistory = useEditor((s) => s.pushHistory);

  const timeline = useMemo(() => buildTimeline(clips), [clips]);

  const clip = clips.find((c) => c.id === selectedClipId);
  const cue = subtitles.find((c) => c.id === selectedCueId);
  const asset = clip ? assets.find((a) => a.id === clip.assetId) : undefined;

  if (clip) {
    const placed = timeline.clips.find((c) => c.id === clip.id);
    const canSplit = placed && currentTime > placed.start + 0.05 && currentTime < placed.end - 0.05;
    return (
      <div>
        <PanelHeader icon={<Layers className="h-4 w-4" />} title="Klip" subtitle={asset?.name} />
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 text-center text-xs">
            <Info label="Süre" value={formatTime(clipDuration(clip))} />
            <Info label="Kaynak" value={`${formatTime(clip.in)}–${formatTime(clip.out)}`} />
          </div>

          <div>
            <Slider
              label="Hız (ağır / hızlı çekim)"
              min={0.25}
              max={4}
              step={0.05}
              value={clip.speed}
              onChange={(v) => updateClip(clip.id, { speed: v })}
              format={(v) => `${v.toFixed(2)}×`}
            />
            <div className="mt-1.5 grid grid-cols-6 gap-1">
              {[0.25, 0.5, 1, 1.5, 2, 4].map((sp) => (
                <button
                  key={sp}
                  onClick={() => {
                    pushHistory();
                    updateClip(clip.id, { speed: sp });
                  }}
                  className={
                    "rounded-md py-1 text-[10px] font-medium tabular-nums transition-colors " +
                    (Math.abs(clip.speed - sp) < 0.001
                      ? "bg-brand-500 text-white"
                      : "bg-white/[0.04] text-slate-400 hover:bg-white/[0.08] hover:text-slate-200")
                  }
                >
                  {sp}×
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg bg-black/20 px-3 py-2 text-center text-[11px] text-slate-400">
            Hızlandırılmış süre: <span className="font-semibold text-slate-200">{formatTime(clipDuration(clip))}</span>
          </div>

          <Field label="Geçiş (önceki klipten)">
            <Select<TransitionType>
              value={clip.transition}
              onChange={(v) => {
                pushHistory();
                updateClip(clip.id, { transition: v });
              }}
              options={[
                { value: "none", label: "Yok (sert kesim)" },
                { value: "fade", label: "Yumuşak geçiş" },
              ]}
            />
          </Field>

          <button
            onClick={() => {
              pushHistory();
              updateClip(clip.id, { muted: !clip.muted });
            }}
            className="flex w-full items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 hover:bg-white/[0.04]"
          >
            <span className="text-xs font-medium text-slate-200">Klip sesi</span>
            {clip.muted ? <VolumeX className="h-4 w-4 text-rose-400" /> : <Volume2 className="h-4 w-4 text-emerald-400" />}
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                if (canSplit && placed) splitClipAtSource(clip.id, timelineToSource(placed, currentTime));
              }}
              disabled={!canSplit}
              className="btn-soft text-xs"
            >
              <Scissors className="h-3.5 w-3.5" /> Böl
            </button>
            <button onClick={() => duplicateClip(clip.id)} className="btn-soft text-xs">
              <Copy className="h-3.5 w-3.5" /> Kopyala
            </button>
          </div>
          <button onClick={() => removeClip(clip.id)} className="btn-ghost w-full text-xs !text-rose-300 hover:!bg-rose-500/10">
            <Trash2 className="h-3.5 w-3.5" /> Klibi Sil
          </button>
        </div>
      </div>
    );
  }

  if (cue) {
    return (
      <div>
        <PanelHeader icon={<Captions className="h-4 w-4" />} title="Altyazı Satırı" />
        <div className="space-y-3">
          <Field label="Metin">
            <textarea
              value={cue.text}
              onFocus={() => pushHistory()}
              onChange={(e) => updateCue(cue.id, { text: e.target.value })}
              rows={3}
              className="input resize-none"
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Başlangıç (sn)">
              <input
                type="number"
                step={0.1}
                value={cue.start.toFixed(1)}
                onFocus={() => pushHistory()}
                onChange={(e) => updateCue(cue.id, { start: Math.max(0, parseFloat(e.target.value) || 0) })}
                className="input"
              />
            </Field>
            <Field label="Bitiş (sn)">
              <input
                type="number"
                step={0.1}
                value={cue.end.toFixed(1)}
                onFocus={() => pushHistory()}
                onChange={(e) => updateCue(cue.id, { end: parseFloat(e.target.value) || cue.start + 1 })}
                className="input"
              />
            </Field>
          </div>
          <button onClick={() => removeCue(cue.id)} className="btn-ghost w-full text-xs !text-rose-300 hover:!bg-rose-500/10">
            <Trash2 className="h-3.5 w-3.5" /> Satırı Sil
          </button>
        </div>
      </div>
    );
  }

  // Default: project summary
  const dims = settings.aspect === "original" ? "Orijinal" : `${ASPECT_PRESETS[settings.aspect].w}×${ASPECT_PRESETS[settings.aspect].h}`;
  return (
    <div>
      <PanelHeader icon={<Settings2 className="h-4 w-4" />} title="Proje" subtitle="Bir klip veya altyazı seçerek ayarlarını düzenleyin." />
      <div className="space-y-2">
        <Info label="Çözünürlük" value={dims} wide />
        <Info label="Klip sayısı" value={String(clips.length)} wide />
        <Info label="Toplam süre" value={formatTime(timeline.duration)} wide />
        <Info label="Altyazı satırı" value={String(subtitles.length)} wide />
      </div>
      <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.015] p-3 text-[11px] leading-relaxed text-slate-500">
        <Gauge className="mb-1.5 h-4 w-4 text-brand-300" />
        İpucu: Zaman çizelgesinde bir klibi seçip kenarlarından sürükleyerek kırpabilir, oynatma çizgisinde <b className="text-slate-300">S</b> veya <b className="text-slate-300">Ctrl+B</b> ile bölebilirsiniz.
      </div>
    </div>
  );
}

function Info({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={"rounded-lg bg-black/20 px-3 py-2 " + (wide ? "flex items-center justify-between" : "")}>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-sm font-semibold text-slate-200">{value}</div>
    </div>
  );
}
