import { NextResponse } from "next/server";
import { schedulerStatus } from "@/lib/server/automations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const s = schedulerStatus();
  return NextResponse.json({ ok: true, version: "3.0.0", uptime: Math.round(process.uptime()), scheduler: { started: s.started, lastTick: s.lastTick, running: s.running.length } });
}
