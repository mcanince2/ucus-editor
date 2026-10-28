"use client";

import { useEditor } from "./store";
import { saveProject, getProject, SaveConflictError, watchProxy } from "./api";
import type { ProjectDoc } from "./types";

/** Build the ProjectDoc from the live store. */
export function currentDoc(): ProjectDoc {
  const s = useEditor.getState();
  return {
    clips: s.clips,
    subtitles: s.subtitles,
    subtitleStyle: s.subtitleStyle,
    logo: s.logo,
    music: s.music,
    overlays: s.overlays,
    audioTracks: s.audioTracks,
    settings: s.settings,
    autoEdit: s.autoEdit,
  };
}

export function shareUrl(id: string): string {
  if (typeof window === "undefined") return `/?p=${id}`;
  return `${window.location.origin}/?p=${encodeURIComponent(id)}`;
}

function setUrlProject(id?: string) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("p", id);
  else url.searchParams.delete("p");
  window.history.replaceState(null, "", url.toString());
}

let inFlight: Promise<boolean> | null = null;

/**
 * Save the open project to the server. Returns true on success. On a
 * conflict (someone else saved a newer copy) it marks `project.conflict`
 * and shows a toast; the next explicit save overwrites.
 */
export function saveCurrentProject(opts: { force?: boolean; quiet?: boolean } = {}): Promise<boolean> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const st = useEditor.getState();
    const { project } = st;
    st.setProject({ saving: true });
    try {
      const res = await saveProject({
        id: project.id,
        name: project.name || "Adsız proje",
        doc: currentDoc(),
        assets: st.assets,
        baseUpdatedAt: project.updatedAt,
        force: opts.force || project.conflict,
      });
      useEditor.getState().setProject({
        id: res.id,
        updatedAt: res.updatedAt,
        dirty: false,
        saving: false,
        conflict: false,
      });
      setUrlProject(res.id);
      if (!opts.quiet) st.showToast("success", "Proje buluta kaydedildi.");
      return true;
    } catch (e: any) {
      const s2 = useEditor.getState();
      if (e instanceof SaveConflictError) {
        s2.setProject({ saving: false, conflict: true });
        s2.showToast(
          "error",
          "Bu projeyi başka biri daha yeni kaydetmiş. Sayfayı yenileyip onun halini alın ya da tekrar Kaydet'e basarak üzerine yazın."
        );
      } else {
        s2.setProject({ saving: false });
        s2.showToast("error", "Kaydedilemedi: " + (e?.message || e));
      }
      return false;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** Open a saved project by id (from the Projects list or a share link). */
export async function openProject(id: string): Promise<boolean> {
  const st = useEditor.getState();
  try {
    const p = await getProject(id);
    st.loadProject(p);
    setUrlProject(p.id);
    const missing = p.assets.filter((a) => a.missing);
    if (missing.length) {
      st.showToast(
        "error",
        `${missing.length} medya dosyası sunucuda yok (sunucu yeniden başlamış olabilir). Bu klipleri yeniden yükleyin.`
      );
    } else {
      st.showToast("success", `"${p.name}" açıldı.`);
    }
    // Resume proxy generation for videos whose preview copy isn't ready yet.
    for (const a of p.assets) {
      if (a.kind === "video" && !a.missing && a.proxyStatus !== "ready") {
        watchProxy(a.id, (patch) => useEditor.getState().updateAsset(a.id, patch));
      }
    }
    return true;
  } catch (e: any) {
    st.showToast("error", "Proje açılamadı: " + (e?.message || e));
    return false;
  }
}

export function startNewProject() {
  useEditor.getState().newProject();
  setUrlProject(undefined);
}
