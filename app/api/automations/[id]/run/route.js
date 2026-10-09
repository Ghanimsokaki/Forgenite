import { NextResponse } from "next/server";
import { getAutomation, runAutomation } from "@/lib/server/automations";
import { guard } from "@/lib/server/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** POST → start a run now. ?wait=1 waits for the result (else returns 202). */
export async function POST(req, { params }) {
  const blocked = guard(req, { name: "auto-run", limit: 20 });
  if (blocked) return blocked;
  if (!(await getAutomation(params.id))) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const wait = req.nextUrl.searchParams.get("wait") === "1";
  const p = runAutomation(params.id, { trigger: "manual" });
  if (wait) {
    try {
      return NextResponse.json({ run: await p });
    } catch (e) {
      return NextResponse.json({ error: e.message }, { status: e.status || 500 });
    }
  }
  // Surface "already running" synchronously-ish.
  const early = await Promise.race([p.then(() => null, (e) => e), new Promise((r) => setTimeout(() => r(null), 50))]);
  if (early) return NextResponse.json({ error: early.message }, { status: early.status || 500 });
  p.catch(() => {});
  return NextResponse.json({ ok: true, started: true }, { status: 202 });
}
