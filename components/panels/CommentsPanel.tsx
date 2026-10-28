"use client";

import { useEffect, useRef, useState } from "react";
import { MessageSquare, Send, Trash2, Clock, Loader2, CloudUpload } from "lucide-react";
import { useEditor } from "@/lib/store";
import { listComments, addComment, deleteComment } from "@/lib/api";
import { saveCurrentProject } from "@/lib/project-client";
import { PanelHeader, EmptyHint } from "@/components/ui";
import { formatTime } from "@/lib/format";
import type { ProjectComment } from "@/lib/types";

const AUTHOR_KEY = "ucus-studio-author";

export default function CommentsPanel() {
  const projectId = useEditor((s) => s.project.id);
  const currentTime = useEditor((s) => s.currentTime);
  const seek = useEditor((s) => s.seek);
  const showToast = useEditor((s) => s.showToast);

  const [comments, setComments] = useState<ProjectComment[] | null>(null);
  const [author, setAuthor] = useState("");
  const [text, setText] = useState("");
  const [withTime, setWithTime] = useState(true);
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      setAuthor(localStorage.getItem(AUTHOR_KEY) || "");
    } catch {}
  }, []);

  // Load + poll while the panel is open (others may be commenting).
  useEffect(() => {
    if (!projectId) {
      setComments(null);
      return;
    }
    let alive = true;
    const load = async () => {
      try {
        const cs = await listComments(projectId);
        if (alive) setComments(cs);
      } catch {}
    };
    void load();
    const t = setInterval(load, 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [projectId]);

  const send = async () => {
    if (!projectId || !text.trim()) return;
    setSending(true);
    try {
      try {
        localStorage.setItem(AUTHOR_KEY, author);
      } catch {}
      const c = await addComment(projectId, {
        author: author.trim() || "Misafir",
        text: text.trim(),
        time: withTime ? currentTime : undefined,
      });
      setComments((cs) => [...(cs || []), c]);
      setText("");
      setTimeout(() => listRef.current?.scrollTo({ top: 1e9, behavior: "smooth" }), 50);
    } catch (e: any) {
      showToast("error", e.message);
    }
    setSending(false);
  };

  const remove = async (cid: string) => {
    if (!projectId) return;
    try {
      await deleteComment(projectId, cid);
      setComments((cs) => (cs || []).filter((c) => c.id !== cid));
    } catch (e: any) {
      showToast("error", e.message);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <PanelHeader
        icon={<MessageSquare className="h-4 w-4" />}
        title="Yorumlar"
        subtitle="Linki olan herkes bu projeye yorum bırakabilir. Zaman damgalı yorumlar o ana götürür."
      />

      {!projectId ? (
        <EmptyHint title="Önce buluta kaydedin">
          Yorumlar kaydedilmiş projelere bağlıdır.
          <button onClick={() => saveCurrentProject()} className="btn-primary mt-3 w-full text-xs">
            <CloudUpload className="h-3.5 w-3.5" /> Projeyi kaydet
          </button>
        </EmptyHint>
      ) : (
        <>
          <div ref={listRef} className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
            {comments === null ? (
              <div className="flex items-center gap-2 py-6 text-xs text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…
              </div>
            ) : comments.length === 0 ? (
              <EmptyHint title="Henüz yorum yok">İlk yorumu siz bırakın.</EmptyHint>
            ) : (
              comments.map((c) => (
                <div key={c.id} className="group rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
                  <div className="mb-1 flex items-center gap-2 text-[10px] text-slate-500">
                    <span className="font-semibold text-slate-300">{c.author}</span>
                    <span>{new Date(c.createdAt).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })}</span>
                    {typeof c.time === "number" && (
                      <button
                        onClick={() => seek(c.time!)}
                        className="ml-auto inline-flex items-center gap-1 rounded-md bg-brand-500/15 px-1.5 py-0.5 font-mono text-brand-200 hover:bg-brand-500/25"
                        title="Bu ana git"
                      >
                        <Clock className="h-2.5 w-2.5" /> {formatTime(c.time)}
                      </button>
                    )}
                    <button
                      onClick={() => remove(c.id)}
                      className={"rounded p-0.5 text-slate-600 opacity-0 hover:text-rose-400 group-hover:opacity-100" + (typeof c.time === "number" ? "" : " ml-auto")}
                      title="Yorumu sil"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                  <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-100">{c.text}</p>
                </div>
              ))
            )}
          </div>

          <div className="mt-3 space-y-2 rounded-xl border border-white/[0.06] bg-white/[0.015] p-2.5">
            <input
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Adınız"
              className="w-full rounded-md border border-white/[0.06] bg-black/30 px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-brand-400/50"
            />
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void send();
              }}
              placeholder="Yorumunuz… (⌘/Ctrl+Enter gönderir)"
              rows={3}
              className="w-full resize-none rounded-md border border-white/[0.06] bg-black/30 px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-brand-400/50"
            />
            <div className="flex items-center gap-2">
              <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-400">
                <input type="checkbox" checked={withTime} onChange={(e) => setWithTime(e.target.checked)} className="accent-brand-500" />
                <Clock className="h-3 w-3" /> {formatTime(currentTime)} anına bağla
              </label>
              <button onClick={send} disabled={sending || !text.trim()} className="btn-primary ml-auto h-8 text-xs">
                {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Gönder
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
