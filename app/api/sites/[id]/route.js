import { NextResponse } from "next/server";
import { deleteSite, getSite } from "@/lib/server/sites";
import { guard } from "@/lib/server/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  const blocked = guard(req, { name: "sites", limit: 120 });
  if (blocked) return blocked;
  const s = await getSite(params.id);
  if (!s) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ site: s });
}

export async function DELETE(req, { params }) {
  const blocked = guard(req, { name: "sites-write", limit: 30 });
  if (blocked) return blocked;
  await deleteSite(params.id);
  return NextResponse.json({ ok: true });
}
