"use client";

import { useMemo } from "react";
import { Captions, RefreshCw, Plus, Trash2, Play } from "lucide-react";
import { useEditor } from "@/lib/store";
import { transcribeAsset } from "@/lib/api";
import { buildTimeline, mapAssetCuesToTimeline } from "@/lib/timeline";
import { splitCuesShort } from "@/lib/subtitles";
import { PanelHeader, Segmented, Slider, Select, ColorField, Toggle, Field, EmptyHint } from "@/components/ui";
import { FONT_OPTIONS } from "@/lib/constants";
import { formatTime, uid } from "@/lib/format";
import type { SubtitleCue, SubtitlePreset } from "@/lib/types";

export default function SubtitlesPanel() {
  const subtitles = useEditor((s) => s.subtitles);
  const style = useEditor((s) => s.subtitleStyle);
  const clips = useEditor((s) => s.clips);
  const selectedCueId = useEditor((s) => s.selectedCueId);
  const health = useEditor((s) => s.health);
  const currentTime = useEditor((s) => s.currentTime);

  const setStyle = useEditor((s) => s.setSubtitleStyle);
  const applyPreset = useEditor((s) => s.applySubtitlePreset);
  const updateCue = useEditor((s) => s.updateCue);
  const removeCue = useEditor((s) => s.removeCue);
  const addCue = useEditor((s) => s.addCue);
  const setSubtitles = useEditor((s) => s.setSubtitles);
  const selectCue = useEditor((s) => s.selectCue);
  const seek = useEditor((s) => s.seek);
  const pushHistory = useEditor((s) => s.pushHistory);
  const setBusy = useEditor((s) => s.setBusy);
  const showToast = useEditor((s) => s.showToast);

  const duration = useMemo(() => buildTimeline(clips).duration, [clips]);

  const regenerate = async () => {
    if (!health?.transcribeReady) {
      showToast("error", "Konuşma tanıma sağlayıcısı yok.");
      return;
    }
    const curClips = useEditor.getState().clips;
    if (!curClips.length) {
      showToast("error", "Önce otomatik kurguyu çalıştırın.");
      return;
    }
    const placed = buildTimeline(curClips).clips;
    const ids = Array.from(new Set(curClips.map((c) => c.assetId)));
    setBusy({ task: "Altyazılar yeniden oluşturuluyor", progress: 0 });
    const all: SubtitleCue[] = [];
    let done = 0;
    for (const id of ids) {
      try {
        const res = await transcribeAsset(id);
        all.push(...mapAssetCuesToTimeline(id, res.cues, placed));
      } catch (e: any) {
        showToast("error", e.message);
      }
      done++;
      setBusy({ task: "Altyazılar yeniden oluşturuluyor", progress: Math.round((done / ids.length) * 100) });
    }
    all.sort((a, b) => a.start - b.start);
    const short = splitCuesShort(all);
    setSubtitles(short);
    setBusy(null);
    showToast("success", `${short.length} satır oluşturuldu.`);
  };

  const addManual = () => {
    addCue({
      id: uid("cue_"),
      start: currentTime,
      end: Math.min(duration || currentTime + 2, currentTime + 2),
      text: "Yeni altyazı",
    });
  };

  return (
    <div>
      <PanelHeader
        icon={<Captions className="h-4 w-4" />}
        title="Altyazılar"
        subtitle="Modern sosyal medya stilinde Türkçe altyazılar. Her satırı elle düzenleyebilirsiniz."
      />

      {/* Style presets */}
      <div className="mb-3">
        <p className="panel-title mb-2">Stil</p>
        <div className="grid grid-cols-2 gap-1.5">
          {(
            [
              { v: "clean", label: "Temiz Beyaz" },
              { v: "keyword", label: "Sarı Vurgu" },
              { v: "tiktok", label: "TikTok / Reels" },
              { v: "documentary", label: "Belgesel" },
            ] as { v: SubtitlePreset; label: string }[]
          ).map((p) => (
            <button
              key={p.v}
              onClick={() => applyPreset(p.v)}
              className={
                "rounded-lg border px-2 py-2 text-xs font-medium transition-all " +
                (style.preset === p.v
                  ? "border-brand-400 bg-brand-500/15 text-white"
                  : "border-white/[0.07] bg-white/[0.02] text-slate-400 hover:bg-white/[0.05]")
              }
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Style controls */}
      <div className="space-y-3 rounded-xl border border-white/[0.06] bg-white/[0.015] p-3">
        <Field label="Yazı tipi">
          <Select
            value={style.fontFamily}
            onChange={(v) => setStyle({ fontFamily: v })}
            options={FONT_OPTIONS.map((f) => ({ value: f, label: f }))}
          />
        </Field>
        <Slider label="Boyut" min={24} max={96} value={style.fontSize} onChange={(v) => setStyle({ fontSize: v })} />
        <Slider
          label="Dikey konum"
          min={0.3}
          max={0.95}
          step={0.01}
          value={style.positionY}
          onChange={(v) => setStyle({ positionY: v })}
          format={(v) => `${Math.round(v * 100)}%`}
        />
        <ColorField label="Metin rengi" value={style.primaryColor} onChange={(v) => setStyle({ primaryColor: v })} />
        <ColorField label="Vurgu rengi" value={style.highlightColor} onChange={(v) => setStyle({ highlightColor: v })} />
        <Slider
          label="Kutu opaklığı"
          min={0}
          max={1}
          step={0.05}
          value={style.boxOpacity}
          onChange={(v) => setStyle({ boxOpacity: v })}
          format={(v) => `${Math.round(v * 100)}%`}
        />
        {style.boxOpacity > 0 && (
          <ColorField label="Kutu rengi" value={style.boxColor} onChange={(v) => setStyle({ boxColor: v })} />
        )}
        <Slider
          label="Kenarlık"
          min={0}
          max={8}
          step={0.5}
          value={style.outlineWidth}
          onChange={(v) => setStyle({ outlineWidth: v })}
        />
        <Slider label="Gölge" min={0} max={10} value={style.shadow} onChange={(v) => setStyle({ shadow: v })} />
        <Slider
          label="Satır başına karakter"
          min={14}
          max={60}
          value={style.maxCharsPerLine}
          onChange={(v) => setStyle({ maxCharsPerLine: v })}
        />
        <div className="grid grid-cols-2 gap-2">
          <Toggle label="Kalın" checked={style.bold} onChange={(v) => setStyle({ bold: v })} />
          <Toggle label="BÜYÜK HARF" checked={style.uppercase} onChange={(v) => setStyle({ uppercase: v })} />
        </div>
      </div>

      {/* Actions */}
      <div className="mt-3 flex gap-2">
        <button onClick={regenerate} className="btn-ghost flex-1 text-xs">
          <RefreshCw className="h-3.5 w-3.5" /> Yeniden Oluştur
        </button>
        <button onClick={addManual} className="btn-soft text-xs" title="Satır ekle">
          <Plus className="h-3.5 w-3.5" /> Satır
        </button>
      </div>

      {/* Cue list */}
      <div className="mt-3">
        <p className="panel-title mb-2">Satırlar ({subtitles.length})</p>
        {subtitles.length === 0 ? (
          <EmptyHint title="Altyazı yok">
            “Yeniden Oluştur” ile Türkçe konuşmadan otomatik altyazı üretin.
          </EmptyHint>
        ) : (
          <div className="max-h-[40vh] space-y-1.5 overflow-y-auto pr-1">
            {subtitles.map((cue) => (
              <div
                key={cue.id}
                className={
                  "rounded-lg border p-2 transition-colors " +
                  (cue.id === selectedCueId
                    ? "border-amber-400/50 bg-amber-400/[0.06]"
                    : "border-white/[0.06] bg-white/[0.02]")
                }
                onClick={() => selectCue(cue.id)}
              >
                <div className="mb-1 flex items-center gap-2">
                  <button
                    onClick={() => seek(cue.start + 0.01)}
                    className="rounded p-0.5 text-slate-500 hover:text-brand-300"
                    title="Buraya git"
                  >
                    <Play className="h-3 w-3" />
                  </button>
                  <span className="text-[10px] tabular-nums text-slate-500">
                    {formatTime(cue.start)} → {formatTime(cue.end)}
                  </span>
                  <button
                    onClick={() => removeCue(cue.id)}
                    className="ml-auto rounded p-0.5 text-slate-500 hover:text-rose-400"
                    title="Sil"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                <input
                  value={cue.text}
                  onFocus={() => pushHistory()}
                  onChange={(e) => updateCue(cue.id, { text: e.target.value })}
                  className="w-full rounded-md border border-white/[0.06] bg-black/30 px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-brand-400/50"
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
