import { NextResponse } from "next/server";
import { getJob, cancelJob } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const job = getJob(params.id);
  if (!job) return NextResponse.json({ error: "İş bulunamadı" }, { status: 404 });
  return NextResponse.json(job);
}

// Cancel a running export (kills its ffmpeg process).
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const ok = cancelJob(params.id);
  return NextResponse.json({ cancelled: ok });
}
