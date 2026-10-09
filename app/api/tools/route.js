import { NextResponse } from "next/server";
import { executeServerTool } from "@/lib/server/tools";
import { guard } from "@/lib/server/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req) {
  const blocked = guard(req, { name: "tools", limit: Number(process.env.FORGENITE_TOOL_RATE_LIMIT || 90) });
  if (blocked) return blocked;
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }
  const { tool, input } = body || {};
  if (!tool || typeof tool !== "string") {
    return NextResponse.json({ ok: false, error: "A tool name is required." }, { status: 400 });
  }
  const r = await executeServerTool(tool, input);
  return NextResponse.json(r, { status: r.ok ? 200 : /Unknown tool|required|must be|too long/.test(r.error) ? 400 : 502 });
}
