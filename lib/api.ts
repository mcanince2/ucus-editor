"use client";

import type {
  MediaAsset,
  SilenceResult,
  TranscriptResult,
  BuiltinTrack,
  HealthInfo,
  ExportJob,
  ExportRequest,
  SilenceSensitivity,
  ProxyStatus,
} from "./types";

/** Upload a single file with progress via XHR (raw streamed body). */
export function uploadFile(
  file: File,
  id: string,
  onProgress: (pct: number) => void
): Promise<MediaAsset> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const qs = `?id=${encodeURIComponent(id)}&name=${encodeURIComponent(file.name)}`;
    xhr.open("POST", `/api/upload${qs}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch (e) {
          reject(new Error("Geçersiz sunucu yanıtı"));
        }
      } else {
        let msg = "Yükleme hatası";
        try {
          msg = JSON.parse(xhr.responseText).error || msg;
        } catch {}
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error("Ağ hatası"));
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.send(file);
  });
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "İstek başarısız");
  return data as T;
}

/** Poll the server's preview-proxy state for an uploaded video. */
export async function fetchProxyStatus(
  id: string
): Promise<{ proxy: ProxyStatus; proxyUrl?: string } | null> {
  try {
    const res = await fetch(`/api/media/${encodeURIComponent(id)}?status=1`, { cache: "no-store" });
    return res.ok ? res.json() : null;
  } catch {
    return null;
  }
}

/**
 * Keep polling until the preview proxy is ready (or failed) and push the
 * result into the store. Fire-and-forget; safe to call once per upload.
 */
export function watchProxy(id: string, update: (patch: Partial<MediaAsset>) => void) {
  let tries = 0;
  const tick = async () => {
    const st = await fetchProxyStatus(id);
    if (!st) {
      if (tries++ < 200) setTimeout(tick, 4000);
      return;
    }
    if (st.proxy === "ready" && st.proxyUrl) {
      update({ proxyStatus: "ready", proxyUrl: `${st.proxyUrl}&v=${Date.now()}` });
      return;
    }
    if (st.proxy === "error" || st.proxy === "none") {
      update({ proxyStatus: st.proxy });
      return;
    }
    update({ proxyStatus: st.proxy });
    // Transcoding a long 4K clip on a small server can take minutes.
    if (tries++ < 400) setTimeout(tick, 3000);
  };
  setTimeout(tick, 1500);
}

export const analyzeSilence = (id: string, sensitivity: SilenceSensitivity) =>
  postJson<SilenceResult>("/api/silence", { id, sensitivity });

export const transcribeAsset = (id: string) =>
  postJson<TranscriptResult>("/api/transcribe", { id });

export async function fetchMusic(): Promise<BuiltinTrack[]> {
  const res = await fetch("/api/music");
  if (!res.ok) return [];
  return res.json();
}

export async function fetchHealth(): Promise<HealthInfo | null> {
  try {
    const res = await fetch("/api/health");
    return res.ok ? res.json() : null;
  } catch {
    return null;
  }
}

export const startExport = (payload: ExportRequest) =>
  postJson<{ jobId: string }>("/api/export", payload);

export async function getExportJob(id: string): Promise<ExportJob | null> {
  try {
    const res = await fetch(`/api/export/${id}`);
    return res.ok ? res.json() : null;
  } catch {
    return null;
  }
}

export async function cancelExport(id: string): Promise<void> {
  try {
    await fetch(`/api/export/${id}`, { method: "DELETE" });
  } catch {}
}
