"use client";

import { useState } from "react";
import { Undo2, Redo2, Cpu, Captions, Sparkles, CloudUpload, FolderOpen, Link2, Loader2, Check, AlertTriangle } from "lucide-react";
import { useEditor } from "@/lib/store";
import { saveCurrentProject, shareUrl } from "@/lib/project-client";
import ProjectsModal from "./ProjectsModal";
import clsx from "clsx";

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

  const share = async () => {
    let id = project.id;
    if (!id || project.dirty) {
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
        <button onClick={() => saveCurrentProject()} disabled={project.saving} className="btn-soft h-9" title="Buluta kaydet (⌘S)">
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
    </header>
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
