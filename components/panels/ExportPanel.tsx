"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Loader2, CheckCircle2, AlertCircle, Clapperboard, Sparkles } from "lucide-react";
import { useEditor } from "@/lib/store";
import { startExport, getExportJob } from "@/lib/api";
import { PanelHeader, Segmented, Toggle, Field } from "@/components/ui";
import { ASPECT_PRESETS, QUALITY_PRESETS } from "@/lib/constants";
import type { AspectRatio, ExportQuality, ExportJob, ProjectDoc } from "@/lib/types";

export default function ExportPanel() {
  const settings = useEditor((s) => s.settings);
  const clips = useEditor((s) => s.clips);
  const setSettings = useEditor((s) => s.setSettings);
  const showToast = useEditor((s) => s.showToast);

  const [job, setJob] = useState<ExportJob | null>(null);
  const [exporting, setExporting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const doExport = async () => {
    const state = useEditor.getState();
    if (!state.clips.length) {
      showToast("error", "Önce zaman çizelgesine klip ekleyin.");
      return;
    }
    const doc: ProjectDoc = {
      clips: state.clips,
      subtitles: state.subtitles,
      subtitleStyle: state.subtitleStyle,
      logo: state.logo,
      music: state.music,
      overlays: state.overlays,
      audioTracks: state.audioTracks,
      settings: state.settings,
      autoEdit: state.autoEdit,
    };
    const assets = state.assets
      .filter((a) => a.status === "ready")
      .map((a) => ({
        id: a.id,
        kind: a.kind,
        width: a.width,
        height: a.height,
        duration: a.duration,
        hasAudio: a.hasAudio,
      }));

    setExporting(true);
    setJob({ id: "", status: "queued", progress: 0, stage: "Başlatılıyor" });
    try {
      const { jobId } = await startExport({ doc, assets });
      pollRef.current = setInterval(async () => {
        const j = await getExportJob(jobId);
        if (!j) return;
        setJob(j);
        if (j.status === "done" || j.status === "error") {
          if (pollRef.current) clearInterval(pollRef.current);
          setExporting(false);
          if (j.status === "done") showToast("success", "Video hazır! İndirebilirsiniz.");
          else showToast("error", j.error || "Render hatası");
        }
      }, 700);
    } catch (e: any) {
      setExporting(false);
      setJob({ id: "", status: "error", progress: 0, stage: "", error: e.message });
      showToast("error", e.message);
    }
  };

  return (
    <div>
      <PanelHeader
        icon={<Clapperboard className="h-4 w-4" />}
        title="Dışa Aktar"
        subtitle="Altyazı, logo ve müzik gömülü final MP4 oluşturun."
      />

      <div className="space-y-4">
        <div>
          <p className="panel-title mb-2">En-boy oranı</p>
          <div className="grid grid-cols-2 gap-1.5">
            {(Object.keys(ASPECT_PRESETS) as AspectRatio[]).map((k) => (
              <button
                key={k}
                onClick={() => setSettings({ aspect: k })}
                className={
                  "rounded-lg border px-2 py-2 text-left transition-all " +
                  (settings.aspect === k
                    ? "border-brand-400 bg-brand-500/15"
                    : "border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.05]")
                }
              >
                <div className="text-xs font-semibold text-slate-200">{k === "original" ? "Orijinal" : k}</div>
                <div className="text-[10px] text-slate-500">{ASPECT_PRESETS[k].label}</div>
              </button>
            ))}
          </div>
        </div>

        <Field label="Kalite">
          <Segmented<ExportQuality>
            value={settings.quality}
            onChange={(v) => setSettings({ quality: v })}
            options={[
              { value: "auto", label: "Otomatik" },
              { value: "preview", label: "Hızlı" },
              { value: "hd", label: "HD" },
              { value: "full", label: "Tam" },
            ]}
          />
          <p className="mt-1 text-[11px] text-slate-500">{QUALITY_PRESETS[settings.quality].hint}</p>
        </Field>

        <div className="space-y-2">
          <Toggle label="Sesi normalize et" hint="Konuşma seviyesini dengeler (loudnorm)." checked={settings.normalizeVoice} onChange={(v) => setSettings({ normalizeVoice: v })} />
          <Toggle label="Hafif gürültü azaltma" hint="Arka plan uğultusunu hafifçe temizler." checked={settings.denoise} onChange={(v) => setSettings({ denoise: v })} />
          <Toggle label="Bulanık arka plan dolgusu" hint="Dikey export'ta yatay klipler için bulanık fon." checked={settings.blurFill} onChange={(v) => setSettings({ blurFill: v })} />
          <Toggle label="Geçişler" hint="Klipler arası yumuşak geçiş." checked={settings.transitions} onChange={(v) => setSettings({ transitions: v })} />
          <Toggle label="1 sn marka intro" checked={settings.intro} onChange={(v) => setSettings({ intro: v })} />
          <Toggle label="1 sn logo outro" checked={settings.outro} onChange={(v) => setSettings({ outro: v })} />
        </div>

        {(settings.intro || settings.outro) && (
          <Field label="Başlık metni">
            <input className="input" value={settings.introTitle} onChange={(e) => setSettings({ introTitle: e.target.value })} />
          </Field>
        )}

        {/* Progress / result */}
        {job && job.status !== "queued" && (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
            {job.status === "error" ? (
              <div className="flex items-start gap-2 text-xs text-rose-300">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="break-words">{job.error}</span>
              </div>
            ) : job.status === "done" ? (
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" /> Render tamamlandı
                </div>
                <a href={job.downloadUrl} download className="btn-primary mt-3 w-full">
                  <Download className="h-4 w-4" /> Videoyu İndir
                </a>
              </div>
            ) : (
              <div>
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-slate-300">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> {job.stage}
                  </span>
                  <span className="tabular-nums text-slate-400">{job.progress}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${job.progress}%` }} />
                </div>
              </div>
            )}
          </div>
        )}

        <button onClick={doExport} disabled={exporting || !clips.length} className="btn-primary w-full !py-3">
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {exporting ? "Render ediliyor…" : "Videoyu Dışa Aktar"}
        </button>
      </div>
    </div>
  );
}
