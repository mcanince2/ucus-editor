"use client";

import { Wand2, Sparkles, Scissors, Captions, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useEditor } from "@/lib/store";
import { analyzeSilence, transcribeAsset } from "@/lib/api";
import { buildTimeline, mapAssetCuesToTimeline, computeTrimStats } from "@/lib/timeline";
import { SILENCE_PROFILES } from "@/lib/constants";
import { PanelHeader, Segmented, Toggle } from "@/components/ui";
import { formatTime } from "@/lib/format";
import type { SilenceSensitivity, SubtitleCue } from "@/lib/types";
import { useMemo } from "react";

export default function AutoEditPanel() {
  const assets = useEditor((s) => s.assets);
  const clips = useEditor((s) => s.clips);
  const autoEdit = useEditor((s) => s.autoEdit);
  const settings = useEditor((s) => s.settings);
  const health = useEditor((s) => s.health);

  const setAutoEdit = useEditor((s) => s.setAutoEdit);
  const setSettings = useEditor((s) => s.setSettings);
  const updateAsset = useEditor((s) => s.updateAsset);
  const buildAutoTimeline = useEditor((s) => s.buildAutoTimeline);
  const setSubtitles = useEditor((s) => s.setSubtitles);
  const setBusy = useEditor((s) => s.setBusy);
  const showToast = useEditor((s) => s.showToast);
  const setActivePanel = useEditor((s) => s.setActivePanel);

  const readyVideos = assets.filter((a) => a.kind === "video" && a.status === "ready");
  const stats = useMemo(() => computeTrimStats(assets, clips), [assets, clips]);

  const analyzeAll = async (sensitivity: SilenceSensitivity) => {
    if (!readyVideos.length) {
      showToast("error", "Önce klip yükleyin.");
      return false;
    }
    setBusy({ task: "Ses analiz ediliyor ve sessizlikler algılanıyor", progress: 0 });
    let i = 0;
    for (const a of readyVideos) {
      try {
        const res = await analyzeSilence(a.id, sensitivity);
        updateAsset(a.id, {
          silences: res.silences,
          waveform: res.waveform,
          analyzed: true,
          duration: res.duration || a.duration,
        });
      } catch (e: any) {
        showToast("error", `${a.name}: ${e.message}`);
      }
      i++;
      setBusy({ task: "Sessizlikler algılanıyor", progress: Math.round((i / readyVideos.length) * 100) });
    }
    return true;
  };

  const runSilenceEdit = async () => {
    const ok = await analyzeAll(autoEdit.sensitivity);
    if (ok) {
      buildAutoTimeline();
      showToast("success", "Otomatik kurgu hazır. Zaman çizelgesini düzenleyebilirsiniz.");
    }
    setBusy(null);
  };

  const runSubtitles = async () => {
    if (!health?.transcribeReady) {
      showToast("error", "Konuşma tanıma sağlayıcısı yok. Yerel `whisper` kurun veya OPENAI_API_KEY ekleyin.");
      return;
    }
    const curClips = useEditor.getState().clips;
    if (!curClips.length) {
      showToast("error", "Önce otomatik kurguyu çalıştırın.");
      return;
    }
    const placed = buildTimeline(curClips).clips;
    const assetIds = Array.from(new Set(curClips.map((c) => c.assetId)));
    setBusy({ task: `Türkçe altyazı oluşturuluyor (${health.whisperLocal ? "yerel whisper" : "OpenAI"})`, progress: 0 });
    const all: SubtitleCue[] = [];
    let done = 0;
    for (const id of assetIds) {
      try {
        const res = await transcribeAsset(id);
        const mapped = mapAssetCuesToTimeline(id, res.cues, placed);
        all.push(...mapped);
      } catch (e: any) {
        showToast("error", `Altyazı hatası: ${e.message}`);
      }
      done++;
      setBusy({ task: "Türkçe altyazı oluşturuluyor", progress: Math.round((done / assetIds.length) * 100) });
    }
    all.sort((a, b) => a.start - b.start);
    setSubtitles(all);
    setBusy(null);
    if (all.length) {
      showToast("success", `${all.length} altyazı satırı oluşturuldu.`);
      setActivePanel("subtitles");
    } else {
      showToast("info", "Konuşma algılanmadı.");
    }
  };

  const oneClick = async () => {
    const ok = await analyzeAll(autoEdit.sensitivity);
    if (!ok) {
      setBusy(null);
      return;
    }
    buildAutoTimeline();
    if (health?.transcribeReady) {
      await new Promise((r) => setTimeout(r, 50)); // let clips commit
      await runSubtitles();
    } else {
      setBusy(null);
    }
    showToast("success", "Tek tıkla temiz kurgu tamamlandı!");
  };

  return (
    <div>
      <PanelHeader
        icon={<Wand2 className="h-4 w-4" />}
        title="Otomatik Kurgu"
        subtitle="Sessizlikleri kırpar, klipleri birleştirir ve isteğe bağlı Türkçe altyazı üretir."
      />

      <div className="space-y-4">
        <div>
          <p className="panel-title mb-2">Kesim hassasiyeti</p>
          <Segmented<SilenceSensitivity>
            value={autoEdit.sensitivity}
            onChange={(v) => setAutoEdit({ sensitivity: v })}
            options={[
              { value: "light", label: "Hafif" },
              { value: "balanced", label: "Dengeli" },
              { value: "aggressive", label: "Sıkı" },
            ]}
          />
          <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
            {SILENCE_PROFILES[autoEdit.sensitivity].hint}
          </p>
        </div>

        <Toggle
          label="Sessizlikleri otomatik kaldır"
          hint="Uzun duraklamaları ve ölü anları kırpar."
          checked={autoEdit.removeSilence}
          onChange={(v) => setAutoEdit({ removeSilence: v })}
        />
        <Toggle
          label="Klipler arası geçişler"
          hint="Klip birleşimlerine yumuşak, hafif geçiş ekler."
          checked={settings.transitions}
          onChange={(v) => setSettings({ transitions: v })}
        />

        <button onClick={runSilenceEdit} className="btn-ghost w-full">
          <Scissors className="h-4 w-4" /> Sessizlikleri Kes & Birleştir
        </button>

        <button onClick={runSubtitles} className="btn-ghost w-full">
          <Captions className="h-4 w-4" /> Türkçe Altyazı Oluştur
        </button>

        <div className="rounded-2xl border border-brand-400/20 bg-brand-500/[0.06] p-3">
          <button onClick={oneClick} className="btn-primary w-full">
            <Sparkles className="h-4 w-4" /> Tek Tıkla Temiz Kurgu
          </button>
          <p className="mt-2 text-center text-[11px] text-slate-400">
            Sessizlik kesimi + birleştirme + Türkçe altyazı — hepsi tek seferde.
          </p>
        </div>

        {clips.length > 0 && (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-xs">
            <div className="flex items-center gap-2 text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
              <span className="font-medium">Kurgu hazır</span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              <Stat label="Orijinal" value={formatTime(stats.original)} />
              <Stat label="Kırpılan" value={formatTime(stats.removed)} accent />
              <Stat label="Sonuç" value={formatTime(stats.kept)} />
            </div>
          </div>
        )}

        {!health?.transcribeReady && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-500/[0.06] p-3 text-[11px] text-amber-200/90">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Altyazı için konuşma tanıma bulunamadı. Yerel <code className="rounded bg-black/30 px-1">whisper</code> kurun
              ya da <code className="rounded bg-black/30 px-1">OPENAI_API_KEY</code> ekleyin. Diğer tüm özellikler çalışır.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg bg-black/20 py-1.5">
      <div className={accent ? "font-semibold text-rose-300" : "font-semibold text-slate-200"}>{value}</div>
      <div className="text-[9px] uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}
