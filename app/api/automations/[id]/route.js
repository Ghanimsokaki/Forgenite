import { NextResponse } from "next/server";
import { deleteAutomation, getAutomation, listRuns, publicAutomation, updateAutomation } from "@/lib/server/automations";
import { guard } from "@/lib/server/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  const blocked = guard(req, { name: "auto-read", limit: 240 });
  if (blocked) return blocked;
  const a = await getAutomation(params.id);
  if (!a) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ automation: publicAutomation(a), runs: await listRuns(params.id) });
}

export async function PATCH(req, { params }) {
  const blocked = guard(req, { name: "auto-write", limit: 60 });
  if (blocked) return blocked;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  try {
    const a = await updateAutomation(params.id, body);
    return NextResponse.json({ automation: publicAutomation(a) });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 400 });
  }
}

export async function DELETE(req, { params }) {
  const blocked = guard(req, { name: "auto-write", limit: 60 });
  if (blocked) return blocked;
  await deleteAutomation(params.id);
  return NextResponse.json({ ok: true });
}
