"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FolderOpen, Trash2, Link2, Plus, X, Loader2, MessageSquare, Film, Copy } from "lucide-react";
import { useEditor } from "@/lib/store";
import { listProjects, deleteProjectRemote, duplicateProject } from "@/lib/api";
import { openProject, startNewProject, shareUrl, saveCurrentProject } from "@/lib/project-client";
import { formatTime } from "@/lib/format";
import type { ProjectSummary } from "@/lib/types";

export default function ProjectsModal({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<ProjectSummary[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const currentId = useEditor((s) => s.project.id);
  const dirty = useEditor((s) => s.project.dirty);
  const showToast = useEditor((s) => s.showToast);

  const refresh = async () => {
    try {
      setItems(await listProjects());
    } catch (e: any) {
      showToast("error", e.message);
      setItems([]);
    }
  };
  useEffect(() => {
    void refresh();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const guardUnsaved = () =>
    !dirty || window.confirm("Kaydedilmemiş değişiklikler var. Yine de devam edilsin mi?");

  const open = async (id: string) => {
    if (id === currentId) return onClose();
    if (!guardUnsaved()) return;
    setBusyId(id);
    const ok = await openProject(id);
    setBusyId(null);
    if (ok) onClose();
  };

  const remove = async (id: string) => {
    setBusyId(id);
    try {
      await deleteProjectRemote(id);
      setItems((xs) => (xs || []).filter((x) => x.id !== id));
      if (id === currentId) useEditor.getState().setProject({ id: undefined, updatedAt: undefined, dirty: true });
      showToast("info", "Proje silindi.");
    } catch (e: any) {
      showToast("error", e.message);
    }
    setBusyId(null);
    setConfirmId(null);
  };

  const duplicate = async (p: ProjectSummary) => {
    setBusyId(p.id);
    try {
      // Save pending edits first so the copy reflects what's on screen.
      if (p.id === currentId && dirty) await saveCurrentProject({ quiet: true });
      const copy = await duplicateProject(p.id);
      setItems((xs) => [copy, ...(xs || [])]);
      showToast("success", `"${copy.name}" oluşturuldu.`);
    } catch (e: any) {
      showToast("error", e.message);
    }
    setBusyId(null);
  };

  const copyLink = async (id: string) => {
    try {
      await navigator.clipboard.writeText(shareUrl(id));
      showToast("success", "Paylaşım linki kopyalandı.");
    } catch {
      showToast("info", shareUrl(id));
    }
  };

  const fresh = () => {
    if (!guardUnsaved()) return;
    startNewProject();
    onClose();
  };

  // Portal to <body>: the Topbar has backdrop-filter, which would otherwise
  // make this fixed overlay position itself inside the 56 px header.
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="glass flex max-h-[80vh] w-[560px] max-w-[94vw] flex-col rounded-3xl p-5 shadow-glass"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand-500/15 text-brand-300">
            <FolderOpen className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-[15px] font-semibold text-white">Bulut projeleri</h3>
            <p className="text-xs text-slate-400">Sunucuda kayıtlı projeler. Linki olan herkes açıp düzenleyebilir.</p>
          </div>
          <button onClick={fresh} className="btn-soft ml-auto text-xs">
            <Plus className="h-3.5 w-3.5" /> Yeni proje
          </button>
          <button onClick={onClose} className="btn-soft h-8 w-8 !px-0" title="Kapat">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
          {items === null ? (
            <div className="flex items-center gap-2 py-8 text-xs text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…
            </div>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-500">Henüz kayıtlı proje yok. “Kaydet” ile buluta kaydedin.</p>
          ) : (
            items.map((p) => (
              <div
                key={p.id}
                className={
                  "flex items-center gap-3 rounded-xl border p-2 transition-colors " +
                  (p.id === currentId ? "border-brand-400/50 bg-brand-500/[0.08]" : "border-white/[0.06] bg-white/[0.02] hover:border-white/15")
                }
              >
                <div className="h-12 w-[72px] shrink-0 overflow-hidden rounded-lg bg-black">
                  {p.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.thumbnail} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full w-full place-items-center">
                      <Film className="h-4 w-4 text-slate-600" />
                    </div>
                  )}
                </div>
                <button className="min-w-0 flex-1 text-left" onClick={() => open(p.id)} disabled={busyId === p.id}>
                  <p className="truncate text-xs font-medium text-slate-100">
                    {p.name} {p.id === currentId && <span className="text-brand-300">· açık</span>}
                  </p>
                  <p className="mt-0.5 text-[10px] text-slate-500">
                    {p.clipCount} klip · {formatTime(p.duration)} · {new Date(p.updatedAt).toLocaleString("tr-TR")}
                    {p.commentCount > 0 && (
                      <span className="ml-1 inline-flex items-center gap-0.5">
                        · <MessageSquare className="h-2.5 w-2.5" /> {p.commentCount}
                      </span>
                    )}
                  </p>
                </button>
                <button onClick={() => copyLink(p.id)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white" title="Paylaşım linkini kopyala">
                  <Link2 className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => duplicate(p)}
                  disabled={busyId === p.id}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
                  title="Çoğalt (kopyasını oluştur)"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                {confirmId === p.id ? (
                  <button onClick={() => remove(p.id)} className="rounded-lg bg-rose-500/20 px-2 py-1 text-[11px] font-medium text-rose-200 hover:bg-rose-500/30">
                    {busyId === p.id ? "…" : "Silinsin mi?"}
                  </button>
                ) : (
                  <button onClick={() => setConfirmId(p.id)} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-500/15 hover:text-rose-300" title="Sil">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
