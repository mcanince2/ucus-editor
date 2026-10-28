import { NextResponse } from "next/server";
import { readProject, writeProject } from "@/lib/projects";
import type { ProjectComment } from "@/lib/types";
import { uid } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const p = readProject(params.id);
  if (!p) return NextResponse.json({ error: "Proje bulunamadı." }, { status: 404 });
  return NextResponse.json(p.comments, { headers: { "Cache-Control": "no-store" } });
}

/** Add a comment. Body: { author, text, time? } */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const p = readProject(params.id);
  if (!p) return NextResponse.json({ error: "Proje bulunamadı." }, { status: 404 });
  const body = await req.json().catch(() => null);
  const text = String(body?.text || "").trim().slice(0, 2000);
  if (!text) return NextResponse.json({ error: "Yorum boş olamaz." }, { status: 400 });
  const author = String(body?.author || "Misafir").trim().slice(0, 60) || "Misafir";
  const time = typeof body?.time === "number" && isFinite(body.time) ? Math.max(0, body.time) : undefined;
  const c: ProjectComment = { id: uid("cm_"), author, text, time, createdAt: new Date().toISOString() };
  // Re-read right before writing so a concurrent project save isn't clobbered.
  const fresh = readProject(params.id) || p;
  fresh.comments = [...fresh.comments, c];
  writeProject(fresh);
  return NextResponse.json(c);
}

/** Delete a comment: ?cid=<comment id> */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const cid = new URL(req.url).searchParams.get("cid") || "";
  const p = readProject(params.id);
  if (!p) return NextResponse.json({ error: "Proje bulunamadı." }, { status: 404 });
  const before = p.comments.length;
  p.comments = p.comments.filter((c) => c.id !== cid);
  if (p.comments.length === before) return NextResponse.json({ error: "Yorum bulunamadı." }, { status: 404 });
  writeProject(p);
  return NextResponse.json({ deleted: true });
}
