import type { ExportJob } from "./types";
import type { ChildProcess } from "node:child_process";

// Persist across dev hot-reloads by hanging off globalThis.
const g = globalThis as unknown as {
  __exportJobs?: Map<string, ExportJob>;
  __exportChildren?: Map<string, ChildProcess>;
};
if (!g.__exportJobs) g.__exportJobs = new Map();
if (!g.__exportChildren) g.__exportChildren = new Map();
const jobs = g.__exportJobs;
const children = g.__exportChildren;

export function createJob(id: string): ExportJob {
  const job: ExportJob = { id, status: "queued", progress: 0, stage: "Sıraya alındı" };
  jobs.set(id, job);
  return job;
}

export function updateJob(id: string, patch: Partial<ExportJob>) {
  const cur = jobs.get(id);
  if (cur) jobs.set(id, { ...cur, ...patch });
}

export function getJob(id: string): ExportJob | undefined {
  return jobs.get(id);
}

/** Track the active ffmpeg child so the job can be cancelled. */
export function setJobChild(id: string, child: ChildProcess) {
  children.set(id, child);
}

export function clearJobChild(id: string) {
  children.delete(id);
}

export function isCancelled(id: string): boolean {
  return jobs.get(id)?.stage === "İptal edildi";
}

/** Cancel a running export: kill its ffmpeg process and mark it cancelled. */
export function cancelJob(id: string): boolean {
  const job = jobs.get(id);
  if (!job || job.status === "done") return false;
  const child = children.get(id);
  if (child) {
    try {
      child.kill("SIGKILL");
    } catch {}
    children.delete(id);
  }
  jobs.set(id, { ...job, status: "error", stage: "İptal edildi", error: "İptal edildi" });
  return true;
}
