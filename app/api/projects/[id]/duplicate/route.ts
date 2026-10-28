import { NextResponse } from "next/server";
import { readProject, writeProject, summarize } from "@/lib/projects";
import type { SavedProject } from "@/lib/types";
import { uid } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Copy a project (same clips/assets, fresh id, no comments). */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const src = readProject(params.id);
  if (!src) return NextResponse.json({ error: "Proje bulunamadı." }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const now = new Date().toISOString();
  const copy: SavedProject = {
    ...src,
    id: uid("prj_") + uid(""),
    name: String(body?.name || `${src.name} (kopya)`).slice(0, 120),
    comments: [],
    createdAt: now,
    updatedAt: now,
  };
  writeProject(copy);
  return NextResponse.json(summarize(copy));
}
