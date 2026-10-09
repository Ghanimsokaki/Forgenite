import { NextResponse } from "next/server";
import { listSites, publishFiles } from "@/lib/server/sites";
import { guard } from "@/lib/server/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const blocked = guard(req, { name: "sites", limit: 120 });
  if (blocked) return blocked;
  return NextResponse.json({ sites: await listSites() });
}

/** POST { id?, name, files:[{path,content}] } → publish / republish */
export async function POST(req) {
  const blocked = guard(req, { name: "sites-write", limit: 30 });
  if (blocked) return blocked;
  const b = await req.json().catch(() => null);
  if (!b || !Array.isArray(b.files)) return NextResponse.json({ error: "files[] is required." }, { status: 400 });
  try {
    const site = await publishFiles(b.id, b.files, { name: b.name });
    return NextResponse.json({ site: { id: site.id, name: site.name, version: site.version, updatedAt: site.updatedAt, url: `/s/${site.id}/` } });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
