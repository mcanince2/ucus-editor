import type { ExportJob } from "./types";

// Persist the job map across dev hot-reloads by hanging it off globalThis.
const g = globalThis as unknown as { __exportJobs?: Map<string, ExportJob> };
if (!g.__exportJobs) g.__exportJobs = new Map();
const jobs = g.__exportJobs;

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
