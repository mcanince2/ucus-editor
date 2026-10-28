"use client";

import { useEffect } from "react";
import { useEditor, DOC_KEYS } from "@/lib/store";
import { openProject, saveCurrentProject } from "@/lib/project-client";

/**
 * Invisible component that
 *  - opens the project named in the URL (?p=<id>) on first load,
 *  - marks the project dirty whenever the document or the asset list changes,
 *  - autosaves a dirty, already-saved project every 20 s,
 *  - warns before leaving with unsaved changes.
 */
export default function ProjectSync() {
  // Open from share link.
  useEffect(() => {
    const id = new URL(window.location.href).searchParams.get("p");
    if (id) void openProject(id);
  }, []);

  // Dirty tracking: any document key or the asset list changing → dirty.
  useEffect(() => {
    let prev = snapshot(useEditor.getState());
    let prevProject = projectKey(useEditor.getState());
    return useEditor.subscribe((s) => {
      const next = snapshot(s);
      const key = projectKey(s);
      // A load / save / new-project replaces the document wholesale; that is
      // the clean baseline, not a user edit.
      if (key !== prevProject) {
        prevProject = key;
        prev = next;
        return;
      }
      const changed = prev.some((v, i) => v !== next[i]);
      prev = next;
      if (changed && !s.project.dirty && !s.project.saving) s.setProject({ dirty: true });
    });
  }, []);

  // Autosave (only for projects that already live on the server).
  useEffect(() => {
    const t = setInterval(() => {
      const s = useEditor.getState();
      if (s.project.id && s.project.dirty && !s.project.saving && !s.project.conflict && !s.busy) {
        void saveCurrentProject({ quiet: true });
      }
    }, 20000);
    return () => clearInterval(t);
  }, []);

  // Unsaved-changes guard.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const s = useEditor.getState();
      if (s.project.dirty && (s.clips.length || s.subtitles.length)) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  return null;
}

function snapshot(s: ReturnType<typeof useEditor.getState>): unknown[] {
  return [...DOC_KEYS.map((k) => (s as any)[k]), s.assets];
}

function projectKey(s: ReturnType<typeof useEditor.getState>): string {
  return `${s.project.id || ""}|${s.project.updatedAt || ""}`;
}
