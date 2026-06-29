"use client";

import { Film, Captions, ImageIcon, Music2, Wand2, Clapperboard, Layers } from "lucide-react";
import { useEditor } from "@/lib/store";
import type { PanelId } from "@/lib/types";
import clsx from "clsx";

const ITEMS: { id: PanelId; label: string; icon: React.ReactNode }[] = [
  { id: "media", label: "Medya", icon: <Film className="h-5 w-5" /> },
  { id: "auto", label: "Oto Kurgu", icon: <Wand2 className="h-5 w-5" /> },
  { id: "subtitles", label: "Altyazı", icon: <Captions className="h-5 w-5" /> },
  { id: "logo", label: "Logo", icon: <ImageIcon className="h-5 w-5" /> },
  { id: "music", label: "Müzik", icon: <Music2 className="h-5 w-5" /> },
  { id: "layers", label: "Katmanlar", icon: <Layers className="h-5 w-5" /> },
  { id: "export", label: "Dışa Aktar", icon: <Clapperboard className="h-5 w-5" /> },
];

export default function NavRail() {
  const activePanel = useEditor((s) => s.activePanel);
  const setActivePanel = useEditor((s) => s.setActivePanel);

  return (
    <div className="flex w-[68px] shrink-0 flex-col items-center gap-1 border-r border-white/[0.06] bg-black/20 py-3">
      {ITEMS.map((it) => {
        const active = activePanel === it.id;
        return (
          <button
            key={it.id}
            onClick={() => setActivePanel(it.id)}
            className={clsx(
              "group relative flex w-[56px] flex-col items-center gap-1 rounded-xl py-2.5 transition-all",
              active ? "bg-brand-500/15 text-brand-200" : "text-slate-500 hover:bg-white/[0.04] hover:text-slate-300"
            )}
          >
            {active && <span className="absolute left-0 top-1/2 h-7 -translate-y-1/2 rounded-r-full bg-brand-400 w-[3px]" />}
            {it.icon}
            <span className="text-[9px] font-medium">{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}
