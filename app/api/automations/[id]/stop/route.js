import { NextResponse } from "next/server";
import { stopAutomation } from "@/lib/server/automations";
import { guard } from "@/lib/server/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req, { params }) {
  const blocked = guard(req, { name: "auto-write", limit: 60 });
  if (blocked) return blocked;
  return NextResponse.json({ ok: true, stopped: stopAutomation(params.id) });
}
