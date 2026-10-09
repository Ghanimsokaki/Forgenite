import { NextResponse } from "next/server";
import { createAutomation, listAutomations, publicAutomation, schedulerStatus } from "@/lib/server/automations";
import { guard } from "@/lib/server/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const blocked = guard(req, { name: "auto-read", limit: 240 });
  if (blocked) return blocked;
  const items = (await listAutomations()).map(publicAutomation);
  return NextResponse.json({ automations: items, scheduler: schedulerStatus() });
}

export async function POST(req) {
  const blocked = guard(req, { name: "auto-write", limit: 30 });
  if (blocked) return blocked;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  try {
    const a = await createAutomation(body);
    return NextResponse.json({ automation: publicAutomation(a) }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
