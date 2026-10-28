import fs from "node:fs";
import { makeProxy } from "./ffmpeg";
import { proxyPath } from "./storage";
import type { ProxyStatus } from "./types";

// ─────────────────────────────────────────────────────────────
// Server-side preview-proxy queue. Uploads return immediately; proxies are
// transcoded one at a time in the background (the export and the silence
// analysis share the same CPU, so we never run several in parallel). State
// hangs off globalThis so dev hot-reloads don't lose it.
// ─────────────────────────────────────────────────────────────

const g = globalThis as unknown as {
  __proxyState?: Map<string, ProxyStatus>;
  __proxyQueue?: { id: string; file: string }[];
  __proxyRunning?: boolean;
};
if (!g.__proxyState) g.__proxyState = new Map();
if (!g.__proxyQueue) g.__proxyQueue = [];
const state = g.__proxyState;
const queue = g.__proxyQueue;

export function proxyStatus(id: string): ProxyStatus {
  if (fs.existsSync(proxyPath(id))) return "ready";
  return state.get(id) || "none";
}

export function enqueueProxy(id: string, file: string) {
  if (proxyStatus(id) === "ready") return;
  if (queue.some((q) => q.id === id) || state.get(id) === "running") return;
  state.set(id, "pending");
  queue.push({ id, file });
  void pump();
}

async function pump() {
  if (g.__proxyRunning) return;
  g.__proxyRunning = true;
  try {
    while (queue.length) {
      const job = queue.shift()!;
      if (!fs.existsSync(job.file)) {
        state.set(job.id, "error");
        continue;
      }
      state.set(job.id, "running");
      try {
        const out = await makeProxy(job.file, job.id);
        state.set(job.id, out ? "ready" : "error");
      } catch (e) {
        console.error(`[proxy ${job.id}] failed:`, e);
        state.set(job.id, "error");
      }
    }
  } finally {
    g.__proxyRunning = false;
  }
}
