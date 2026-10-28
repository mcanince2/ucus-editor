import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, ensureDirs, findUpload, proxyPath } from "./storage";
import { buildTimeline } from "./timeline";
import type { MediaAsset, ProjectDoc, ProjectSummary, SavedProject } from "./types";

// ─────────────────────────────────────────────────────────────
// Server-side project store: one JSON file per project under
// <DATA_DIR>/projects. Anyone with the link (?p=<id>) can open, edit, save
// and comment — there is no auth in this app. Lives on the same volume as
// the uploads, so it is exactly as durable as they are.
// ─────────────────────────────────────────────────────────────

export const PROJECTS_DIR = path.join(DATA_DIR, "projects");

export function validProjectId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{4,64}$/.test(id);
}

function filePath(id: string): string {
  ensureDirs();
  fs.mkdirSync(PROJECTS_DIR, { recursive: true });
  return path.join(PROJECTS_DIR, `${id}.json`);
}

export function readProject(id: string): SavedProject | null {
  if (!validProjectId(id)) return null;
  try {
    const raw = fs.readFileSync(filePath(id), "utf8");
    const p = JSON.parse(raw) as SavedProject;
    if (!p || typeof p !== "object" || !p.doc) return null;
    if (!Array.isArray(p.comments)) p.comments = [];
    if (!Array.isArray(p.assets)) p.assets = [];
    return p;
  } catch {
    return null;
  }
}

/** Atomic write (tmp + rename) so a crash never leaves a half-written project. */
export function writeProject(p: SavedProject) {
  const fp = filePath(p.id);
  const tmp = fp + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(p), "utf8");
  fs.renameSync(tmp, fp);
}

export function deleteProject(id: string): boolean {
  if (!validProjectId(id)) return false;
  const fp = filePath(id);
  if (!fs.existsSync(fp)) return false;
  fs.unlinkSync(fp);
  return true;
}

/**
 * Keep only what a reopened project needs from an asset record: drop upload
 * progress / transient status. Uploads that never finished are not saved.
 */
export function sanitizeAssets(assets: MediaAsset[]): MediaAsset[] {
  return (assets || [])
    .filter((a) => a && a.id && a.status === "ready")
    .map((a) => {
      const { progress, error, missing, ...rest } = a;
      void progress;
      void error;
      void missing;
      return { ...rest, status: "ready" as const };
    });
}

/**
 * Refresh server-dependent asset fields on read: whether the source file still
 * exists and whether a preview proxy is available now.
 */
export function annotateAssets(assets: MediaAsset[]): MediaAsset[] {
  return assets.map((a) => {
    const src = findUpload(a.id);
    const missing = !src || !fs.existsSync(src);
    const hasProxy = a.kind === "video" && fs.existsSync(proxyPath(a.id));
    return {
      ...a,
      missing,
      proxyUrl: hasProxy ? `/api/media/${a.id}?proxy=1` : undefined,
      proxyStatus: a.kind === "video" ? (hasProxy ? "ready" : missing ? "none" : "pending") : "none",
    };
  });
}

export function summarize(p: SavedProject): ProjectSummary {
  const doc = p.doc as ProjectDoc;
  const clips = Array.isArray(doc?.clips) ? doc.clips : [];
  const duration = buildTimeline(clips).duration;
  const firstVideoId = clips[0]?.assetId;
  const firstVideo = p.assets.find((a) => a.id === firstVideoId) || p.assets.find((a) => a.kind === "video");
  return {
    id: p.id,
    name: p.name,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    clipCount: clips.length,
    duration,
    commentCount: p.comments.length,
    thumbnail: firstVideo?.thumbnail,
  };
}

export function listProjects(): ProjectSummary[] {
  ensureDirs();
  fs.mkdirSync(PROJECTS_DIR, { recursive: true });
  const out: ProjectSummary[] = [];
  for (const f of fs.readdirSync(PROJECTS_DIR)) {
    if (!f.endsWith(".json")) continue;
    const p = readProject(f.slice(0, -5));
    if (p) out.push(summarize(p));
  }
  out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return out;
}
