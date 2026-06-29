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
