import { NextResponse } from "next/server";
import { tick, startScheduler } from "@/lib/server/automations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * External heartbeat for hosts without a long-running process (Vercel Cron,
 * GitHub Actions, cron-job.org, UptimeRobot…). Protected by CRON_SECRET:
 *   GET /api/cron?secret=XXX   or   Authorization: Bearer XXX
 * On serverless, due runs execute inside this request (await=1 by default).
 */
export async function GET(req) {
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured on the server." }, { status: 503 });
  const given = req.nextUrl.searchParams.get("secret") || (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (given !== secret) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  startScheduler();
  const r = await tick("cron");
  return NextResponse.json({ ok: true, ...r });
}
export const POST = GET;
