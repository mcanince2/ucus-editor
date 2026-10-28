import { NextResponse } from "next/server";
import { readProject, deleteProject, annotateAssets } from "@/lib/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Full project for opening in the editor (assets annotated with file state). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const p = readProject(params.id);
  if (!p) return NextResponse.json({ error: "Proje bulunamadı." }, { status: 404 });
  return NextResponse.json({ ...p, assets: annotateAssets(p.assets) }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const ok = deleteProject(params.id);
  if (!ok) return NextResponse.json({ error: "Proje bulunamadı." }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
