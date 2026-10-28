import { NextResponse } from "next/server";
import { listProjects, readProject, writeProject, sanitizeAssets, validProjectId } from "@/lib/projects";
import type { SavedProject } from "@/lib/types";
import { uid } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** List saved projects (newest first). */
export async function GET() {
  return NextResponse.json(listProjects(), { headers: { "Cache-Control": "no-store" } });
}

/**
 * Create or update a project.
 * Body: { id?, name, doc, assets, baseUpdatedAt?, force? }
 * If `baseUpdatedAt` is older than the stored copy (someone else saved in the
 * meantime) the save is refused with 409 unless `force` is set.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || !body.doc || !Array.isArray(body.doc.clips)) {
    return NextResponse.json({ error: "Geçersiz proje verisi." }, { status: 400 });
  }
  const name = String(body.name || "Adsız proje").slice(0, 120);
  let id: string = typeof body.id === "string" ? body.id : "";
  if (id && !validProjectId(id)) return NextResponse.json({ error: "Geçersiz proje kimliği." }, { status: 400 });

  const now = new Date().toISOString();
  const existing = id ? readProject(id) : null;
  if (existing && !body.force && body.baseUpdatedAt && existing.updatedAt > body.baseUpdatedAt) {
    return NextResponse.json(
      {
        error: "Bu proje başka biri tarafından daha yeni kaydedilmiş.",
        conflict: true,
        updatedAt: existing.updatedAt,
      },
      { status: 409 }
    );
  }
  if (!id) id = uid("prj_") + uid("");

  const project: SavedProject = {
    id,
    name,
    doc: body.doc,
    assets: sanitizeAssets(body.assets || []),
    comments: existing?.comments || [],
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  writeProject(project);
  return NextResponse.json({ id, updatedAt: now, createdAt: project.createdAt });
}
