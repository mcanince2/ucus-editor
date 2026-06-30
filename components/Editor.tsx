"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, CheckCircle2, AlertCircle, Info } from "lucide-react";
import { useEditor } from "@/lib/store";
import { fetchHealth } from "@/lib/api";
import { buildTimeline, timelineToSource, clipAtTime } from "@/lib/timeline";
import Topbar from "./Topbar";
import NavRail from "./NavRail";
import Inspector from "./Inspector";
import PreviewPlayer from "./preview/PreviewPlayer";
import Timeline from "./timeline/Timeline";
import MediaPanel from "./panels/MediaPanel";
import AutoEditPanel from "./panels/AutoEditPanel";
import SubtitlesPanel from "./panels/SubtitlesPanel";
import LogoPanel from "./panels/LogoPanel";
import MusicPanel from "./panels/MusicPanel";
import LayersPanel from "./panels/LayersPanel";
import ExportPanel from "./panels/ExportPanel";

function ActivePanel() {
  const panel = useEditor((s) => s.activePanel);
  switch (panel) {
    case "media":
      return <MediaPanel />;
    case "auto":
      return <AutoEditPanel />;
    case "subtitles":
      return <SubtitlesPanel />;
    case "logo":
      return <LogoPanel />;
    case "music":
      return <MusicPanel />;
    case "layers":
      return <LayersPanel />;
    case "export":
      return <ExportPanel />;
    default:
      return null;
  }
}

export default function Editor() {
  const setHealth = useEditor((s) => s.setHealth);
  const busy = useEditor((s) => s.busy);
  const toast = useEditor((s) => s.toast);

  // Resizable timeline (drag the handle on its top edge).
  const [tlHeight, setTlHeight] = useState(260);
  const resizingRef = useRef(false);
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!resizingRef.current) return;
      const h = window.innerHeight - e.clientY;
      setTlHeight(Math.max(150, Math.min(window.innerHeight * 0.72, h)));
    };
    const onUp = () => {
      resizingRef.current = false;
      document.body.style.cursor = "";
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  useEffect(() => {
    fetchHealth().then(setHealth);
  }, [setHealth]);

  // Seed the Uçuş Saati brand logo + default music as defaults.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/brand-logo");
        if (res.ok) {
          const asset = await res.json();
          const st = useEditor.getState();
          if (!st.assets.some((a) => a.id === asset.id)) st.addAsset(asset);
          if (!st.logo.assetId) st.setLogo({ assetId: asset.id });
        }
      } catch {}
      try {
        const res = await fetch("/api/brand-music");
        if (res.ok) {
          // Brand music (Consumerism) is shipped → make it the default track,
          // overriding the built-in fallback. (If absent, the built-in stays.)
          const asset = await res.json();
          const st = useEditor.getState();
          if (!st.assets.some((a) => a.id === asset.id)) st.addAsset(asset);
          if (st.music.source !== "upload") {
            st.setMusic({ source: "upload", assetId: asset.id, name: asset.name });
          }
        }
      } catch {}
    })();
  }, []);

  // Global keyboard shortcuts.
  useEffect(() => {
    // Split the clip at the playhead — uses the selected clip when the
    // playhead is inside it, otherwise whichever clip sits under the playhead.
    const splitAtPlayhead = () => {
      const s = useEditor.getState();
      const tl = buildTimeline(s.clips);
      const inside = (c: { start: number; end: number } | undefined | null) =>
        !!c && s.currentTime > c.start + 0.05 && s.currentTime < c.end - 0.05;
      let placed = s.selectedClipId ? tl.clips.find((c) => c.id === s.selectedClipId) : null;
      if (!inside(placed)) placed = clipAtTime(tl, s.currentTime);
      if (!inside(placed) || !placed) return;
      if (s.selectedClipId !== placed.id) s.selectClip(placed.id);
      s.splitClipAtSource(placed.id, timelineToSource(placed, s.currentTime));
    };

    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      const s = useEditor.getState();

      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      // Ctrl/Cmd+B → split the clip under the playhead (or the selected one).
      if (mod && e.key.toLowerCase() === "b") {
        e.preventDefault();
        splitAtPlayhead();
        return;
      }
      if (typing) return;

      if (e.code === "Space") {
        e.preventDefault();
        s.togglePlay();
      } else if (e.key === "s" || e.key === "S") {
        splitAtPlayhead();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (s.selectedClipId) s.removeClip(s.selectedClipId);
        else if (s.selectedCueId) s.removeCue(s.selectedCueId);
      } else if (e.key === "ArrowLeft") {
        s.seek(Math.max(0, s.currentTime - (e.shiftKey ? 1 : 1 / 30)));
      } else if (e.key === "ArrowRight") {
        const dur = buildTimeline(s.clips).duration;
        s.seek(Math.min(dur, s.currentTime + (e.shiftKey ? 1 : 1 / 30)));
      } else if (e.key === "Home") {
        s.seek(0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <Topbar />

      <div className="flex min-h-0 flex-1">
        <NavRail />

        {/* Active left panel */}
        <aside className="w-[336px] shrink-0 overflow-y-auto border-r border-white/[0.06] bg-black/15 p-4 no-scrollbar">
          <ActivePanel />
        </aside>

        {/* Center preview */}
        <main className="flex min-w-0 flex-1 flex-col bg-black/10">
          <PreviewPlayer />
        </main>

        {/* Right inspector */}
        <aside className="w-[300px] shrink-0 overflow-y-auto border-l border-white/[0.06] bg-black/15 p-4 no-scrollbar">
          <Inspector />
        </aside>
      </div>

      {/* Timeline (resizable) */}
      <div
        className="flex shrink-0 flex-col border-t border-white/[0.06] bg-black/30 backdrop-blur-xl"
        style={{ height: tlHeight }}
      >
        <div
          onPointerDown={(e) => {
            resizingRef.current = true;
            document.body.style.cursor = "ns-resize";
            e.preventDefault();
          }}
          className="group flex h-2.5 shrink-0 cursor-ns-resize items-center justify-center"
          title="Sürükleyerek boyutlandır"
        >
          <div className="h-1 w-16 rounded-full bg-white/15 transition-colors group-hover:bg-brand-400/70" />
        </div>
        <div className="min-h-0 flex-1">
          <Timeline />
        </div>
      </div>

      {/* Busy overlay */}
      {busy && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm">
          <div className="glass w-[360px] rounded-2xl p-6 text-center">
            <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-brand-300" />
            <p className="text-sm font-medium text-slate-100">{busy.task}</p>
            {typeof busy.progress === "number" && (
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${busy.progress}%` }} />
              </div>
            )}
            <p className="mt-2 text-[11px] text-slate-500">Bu işlem klip uzunluğuna göre biraz sürebilir.</p>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-[270px] left-1/2 z-50 -translate-x-1/2">
          <div
            className={
              "glass flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm shadow-glass " +
              (toast.kind === "error"
                ? "text-rose-200"
                : toast.kind === "success"
                ? "text-emerald-200"
                : "text-slate-200")
            }
          >
            {toast.kind === "error" ? (
              <AlertCircle className="h-4 w-4 text-rose-400" />
            ) : toast.kind === "success" ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            ) : (
              <Info className="h-4 w-4 text-brand-300" />
            )}
            {toast.msg}
          </div>
        </div>
      )}
    </div>
  );
}
