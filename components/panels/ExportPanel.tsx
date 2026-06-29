"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Loader2, CheckCircle2, AlertCircle, Clapperboard, Sparkles, XCircle } from "lucide-react";
import { useEditor } from "@/lib/store";
import { startExport, getExportJob, cancelExport } from "@/lib/api";
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
  const [modalOpen, setModalOpen] = useState(false);
  const [etaSec, setEtaSec] = useState<number>(NaN);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef<number>(0);
  const jobIdRef = useRef<string>("");

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
      .map((a) => ({ id: a.id, kind: a.kind, width: a.width, height: a.height, duration: a.duration, hasAudio: a.hasAudio }));

    setEtaSec(NaN);
    setExporting(true);
    setModalOpen(true);
    startRef.current = Date.now();
    setJob({ id: "", status: "queued", progress: 0, stage: "Başlatılıyor" });
    try {
      const { jobId } = await startExport({ doc, assets });
      jobIdRef.current = jobId;
      pollRef.current = setInterval(async () => {
        const j = await getExportJob(jobId);
        if (!j) return;
        setJob(j);
        const elapsed = (Date.now() - startRef.current) / 1000;
        if (j.status === "running" && j.progress > 3) {
          setEtaSec((elapsed / j.progress) * (100 - j.progress));
        }
        if (j.status === "done" || j.status === "error") {
          if (pollRef.current) clearInterval(pollRef.current);
          setExporting(false);
          setEtaSec(NaN);
          if (j.status === "done") showToast("success", "Video hazır! İndirebilirsiniz.");
        }
      }, 700);
    } catch (e: any) {
      setExporting(false);
      setJob({ id: "", status: "error", progress: 0, stage: "", error: e.message });
    }
  };

  const cancel = async () => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (jobIdRef.current) await cancelExport(jobIdRef.current);
    setExporting(false);
    setModalOpen(false);
    setJob(null);
    setEtaSec(NaN);
    showToast("info", "Render iptal edildi.");
  };

  const closeModal = () => {
    setModalOpen(false);
    setJob(null);
  };

  const fmtEta = (s: number) => {
    if (!isFinite(s) || s < 0) return "hesaplanıyor…";
    const m = Math.floor(s / 60);
    const sec = Math.round(s % 60);
    return m > 0 ? `~${m} dk ${sec} sn kaldı` : `~${sec} sn kaldı`;
  };

  const running = job && (job.status === "running" || job.status === "queued");

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
                  (settings.aspect === k ? "border-brand-400 bg-brand-500/15" : "border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.05]")
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

        <button onClick={doExport} disabled={exporting || !clips.length} className="btn-primary w-full !py-3">
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {exporting ? "Render ediliyor…" : "Videoyu Dışa Aktar"}
        </button>
      </div>

      {/* Full-screen render modal: centered, blurred backdrop, blocks all
          interaction until the render finishes or the user cancels. */}
      {modalOpen && job && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-md">
          <div className="glass w-[400px] max-w-[90vw] rounded-3xl p-8 text-center shadow-glass">
            {running ? (
              <>
                <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-brand-500/15">
                  <Loader2 className="h-7 w-7 animate-spin text-brand-300" />
                </div>
                <h3 className="text-lg font-semibold text-white">Video render ediliyor</h3>
                <p className="mt-1 text-xs text-slate-400">{job.stage}</p>

                <div className="mt-5">
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="font-medium text-brand-300">{fmtEta(etaSec)}</span>
                    <span className="tabular-nums text-slate-400">%{job.progress}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-brand-500 transition-all duration-300" style={{ width: `${job.progress}%` }} />
                  </div>
                </div>

                <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
                  İşlem sürerken pencereyi kapatma. Klip uzunluğuna göre birkaç dakika sürebilir.
                </p>

                <button onClick={cancel} className="btn-ghost mt-5 w-full !text-rose-300 hover:!bg-rose-500/10">
                  <XCircle className="h-4 w-4" /> İptal Et
                </button>
              </>
            ) : job.status === "done" ? (
              <>
                <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-emerald-500/15">
                  <CheckCircle2 className="h-7 w-7 text-emerald-400" />
                </div>
                <h3 className="text-lg font-semibold text-white">Video hazır! 🎉</h3>
                <p className="mt-1 text-xs text-slate-400">Final MP4 oluşturuldu.</p>
                <a href={job.downloadUrl} download className="btn-primary mt-5 w-full !py-3">
                  <Download className="h-4 w-4" /> Videoyu İndir
                </a>
                <button onClick={closeModal} className="btn-soft mt-2 w-full text-xs">
                  Kapat
                </button>
              </>
            ) : (
              <>
                <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-rose-500/15">
                  <AlertCircle className="h-7 w-7 text-rose-400" />
                </div>
                <h3 className="text-lg font-semibold text-white">Render başarısız</h3>
                <p className="mt-2 break-words text-xs text-rose-300/90">{job.error}</p>
                <button onClick={closeModal} className="btn-soft mt-5 w-full">
                  Kapat
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
