import { NextResponse } from "next/server";
import { findUpload } from "@/lib/storage";
import { transcribe } from "@/lib/transcribe";
import fs from "node:fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Transcription can take a while on CPU; no artificial cap locally.
export const maxDuration = 600;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const id: string = body?.id;
  if (!id) return NextResponse.json({ error: "id gerekli" }, { status: 400 });

  const file = findUpload(id);
  if (!file || !fs.existsSync(file)) return NextResponse.json({ error: "Dosya yok" }, { status: 404 });

  try {
    const result = await transcribe(file);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Transkripsiyon hatası" }, { status: 500 });
  }
}
