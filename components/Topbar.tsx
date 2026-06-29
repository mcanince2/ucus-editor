"use client";

import { Undo2, Redo2, Cpu, Captions, Sparkles } from "lucide-react";
import { useEditor } from "@/lib/store";
import clsx from "clsx";

export default function Topbar() {
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const pastLen = useEditor((s) => s._past.length);
  const futureLen = useEditor((s) => s._future.length);
  const health = useEditor((s) => s.health);
  const setActivePanel = useEditor((s) => s.setActivePanel);

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

      <div className="ml-auto flex items-center gap-2">
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
      <span className="hidden md:inline">{label}</span>
    </span>
  );
}
