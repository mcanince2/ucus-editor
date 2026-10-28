"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Undo2, Redo2, Cpu, Captions, Sparkles, CloudUpload, FolderOpen, Link2, Loader2, Check, AlertTriangle, Server, X } from "lucide-react";
import { useEditor } from "@/lib/store";
import { saveCurrentProject, shareUrl } from "@/lib/project-client";
import ProjectsModal from "./ProjectsModal";
import clsx from "clsx";

/** Fired by the Cmd/Ctrl+S shortcut (Editor) so the same save flow runs. */
export const SAVE_REQUEST_EVENT = "ucus:save-request";

export default function Topbar() {
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const pastLen = useEditor((s) => s._past.length);
  const futureLen = useEditor((s) => s._future.length);
  const health = useEditor((s) => s.health);
  const setActivePanel = useEditor((s) => s.setActivePanel);
  const project = useEditor((s) => s.project);
  const setProject = useEditor((s) => s.setProject);
  const showToast = useEditor((s) => s.showToast);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [shareAfterSave, setShareAfterSave] = useState(false);

  /**
   * First save asks for a name and says where the project will live; later
   * saves go straight to the server.
   */
  const requestSave = (thenShare = false) => {
    const p = useEditor.getState().project;
    if (!p.id) {
      setShareAfterSave(thenShare);
      setSaveOpen(true);
      return;
    }
    void saveCurrentProject().then((ok) => {
      if (ok && thenShare) void copyShareLink();
    });
  };

  useEffect(() => {
    const onReq = () => requestSave(false);
    window.addEventListener(SAVE_REQUEST_EVENT, onReq);
    return () => window.removeEventListener(SAVE_REQUEST_EVENT, onReq);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copyShareLink = async () => {
    const id = useEditor.getState().project.id;
    if (!id) return;
    try {
      await navigator.clipboard.writeText(shareUrl(id));
      showToast("success", "Paylaşım linki kopyalandı. Linki olan herkes açıp düzenleyebilir ve yorum bırakabilir.");
    } catch {
      showToast("info", shareUrl(id));
    }
  };

  const share = async () => {
    let id = project.id;
    if (!id) {
      requestSave(true);
      return;
    }
    if (project.dirty) {
      const ok = await saveCurrentProject({ quiet: true });
      if (!ok) return;
      id = useEditor.getState().project.id;
    }
    if (!id) return;
    try {
      await navigator.clipboard.writeText(shareUrl(id));
      showToast("success", "Paylaşım linki kopyalandı. Linki olan herkes açıp düzenleyebilir ve yorum bırakabilir.");
    } catch {
      showToast("info", shareUrl(id));
    }
  };

  const savedLabel = project.saving
    ? "Kaydediliyor…"
    : project.conflict
    ? "Çakışma: tekrar Kaydet = üzerine yaz"
    : project.dirty
    ? project.id
      ? "Kaydedilmemiş değişiklik"
      : "Buluta kaydedilmedi"
    : project.updatedAt
    ? `Kaydedildi ${new Date(project.updatedAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}`
    : "";

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.06] bg-black/30 px-4 backdrop-blur-xl">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand-logo.png" alt="Uçuş Saati" className="h-11 w-auto object-contain" />
        <div className="border-l border-white/10 pl-3">
          <h1 className="text-sm font-bold leading-none text-white">
            <span className="text-brand-400">Studio</span>
          </h1>
          <p className="mt-1 text-[10px] font-medium text-slate-400">Otomatik video kurgu</p>
        </div>
      </div>

      <div className="ml-4 flex items-center gap-1">
        <button onClick={undo} disabled={!pastLen} className="btn-soft h-9 w-9 !px-0" title="Geri al (⌘Z)">
          <Undo2 className="h-4 w-4" />
        </button>
        <button onClick={redo} disabled={!futureLen} className="btn-soft h-9 w-9 !px-0" title="İleri al (⌘⇧Z)">
          <Redo2 className="h-4 w-4" />
        </button>
      </div>

      {/* Project name + cloud state */}
      <div className="ml-3 flex min-w-0 items-center gap-2">
        <input
          value={project.name}
          onChange={(e) => setProject({ name: e.target.value, dirty: true })}
          onBlur={() => !project.name.trim() && setProject({ name: "Adsız proje" })}
          className="h-9 w-[200px] rounded-lg border border-white/[0.06] bg-black/30 px-3 text-xs font-medium text-slate-100 outline-none focus:border-brand-400/50"
          placeholder="Proje adı"
          title="Proje adı"
        />
        <span
          className={clsx(
            "hidden items-center gap-1 text-[10px] lg:inline-flex",
            project.conflict ? "text-amber-300" : project.dirty ? "text-slate-400" : "text-emerald-300"
          )}
        >
          {project.saving ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : project.conflict ? (
            <AlertTriangle className="h-3 w-3" />
          ) : project.dirty ? null : project.updatedAt ? (
            <Check className="h-3 w-3" />
          ) : null}
          {savedLabel}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button onClick={() => requestSave(false)} disabled={project.saving} className="btn-soft h-9" title="Buluta kaydet (⌘S)">
          <CloudUpload className="h-4 w-4" /> <span className="hidden md:inline">Kaydet</span>
        </button>
        <button onClick={() => setProjectsOpen(true)} className="btn-soft h-9" title="Kayıtlı projeler">
          <FolderOpen className="h-4 w-4" /> <span className="hidden md:inline">Projeler</span>
        </button>
        <button onClick={share} className="btn-soft h-9" title="Paylaşım linkini kopyala">
          <Link2 className="h-4 w-4" /> <span className="hidden md:inline">Paylaş</span>
        </button>
        <HealthChip
          ok={!!health?.ffmpeg}
          icon={<Cpu className="h-3 w-3" />}
          label={health?.ffmpeg ? `FFmpeg ${health.ffmpegVersion || ""}` : "FFmpeg yok"}
        />
        <HealthChip
          ok={!!health?.transcribeReady}
          icon={<Captions className="h-3 w-3" />}
          label={
            health?.transcribeReady
              ? health.whisperLocal
                ? `Whisper ${health.whisperModel}`
                : "OpenAI"
              : "Altyazı sağlayıcı yok"
          }
        />
        <button onClick={() => setActivePanel("export")} className="btn-primary h-9">
          <Sparkles className="h-4 w-4" /> Dışa Aktar
        </button>
      </div>

      {projectsOpen && <ProjectsModal onClose={() => setProjectsOpen(false)} />}
      {saveOpen && (
        <SaveDialog
          initialName={project.name}
          onCancel={() => setSaveOpen(false)}
          onSave={async (name) => {
            setProject({ name });
            setSaveOpen(false);
            const ok = await saveCurrentProject();
            if (ok && shareAfterSave) await copyShareLink();
            setShareAfterSave(false);
          }}
        />
      )}
    </header>
  );
}

function SaveDialog({
  initialName,
  onSave,
  onCancel,
}: {
  initialName: string;
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName === "Yeni proje" ? "" : initialName);
  const host = typeof window !== "undefined" ? window.location.host : "";
  const submit = () => onSave(name.trim() || "Adsız proje");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Portal to <body>: the header's backdrop-filter would trap a fixed overlay.
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onCancel}>
      <div className="glass w-[440px] max-w-[94vw] rounded-3xl p-6 shadow-glass" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand-500/15 text-brand-300">
            <CloudUpload className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-[15px] font-semibold text-white">Projeyi buluta kaydet</h3>
            <p className="text-xs text-slate-400">Bir ad verin; sonra Kaydet doğrudan günceller.</p>
          </div>
          <button onClick={onCancel} className="btn-soft ml-auto h-8 w-8 !px-0" title="Vazgeç">
            <X className="h-4 w-4" />
          </button>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-slate-300">Proje adı</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") onCancel();
            }}
            placeholder="örn. Minik Pilotlar — Eylül etkinliği"
            className="w-full rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 text-sm text-slate-100 outline-none focus:border-brand-400/60"
          />
        </label>

        <div className="mt-4 flex items-start gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-[11px] leading-relaxed text-slate-300">
          <Server className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-300" />
          <div>
            <p>
              <span className="font-semibold text-white">Nereye kaydedilir:</span> bu stüdyonun sunucusuna{" "}
              <span className="font-mono text-brand-200">{host}</span> (bulut, projeler klasörü). Kliplerin kendisi de
              aynı sunucuda yüklü kalır.
            </p>
            <p className="mt-1 text-slate-400">
              Kaydedince adres çubuğuna bir paylaşım linki gelir; <span className="text-slate-200">linki olan herkes</span> projeyi
              açıp düzenleyebilir ve yorum bırakabilir. Kayıtlı projelere üstteki “Projeler”den ulaşırsınız.
            </p>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <button onClick={onCancel} className="btn-soft flex-1">
            Vazgeç
          </button>
          <button onClick={submit} className="btn-primary flex-1">
            <CloudUpload className="h-4 w-4" /> Kaydet
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function HealthChip({ ok, icon, label }: { ok: boolean; icon: React.ReactNode; label: string }) {
  return (
    <span
      className={clsx(
        "chip border",
        ok ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300" : "border-amber-400/20 bg-amber-400/10 text-amber-300"
      )}
      title={label}
    >
      {icon}
      <span className="hidden xl:inline">{label}</span>
    </span>
  );
}
