import { NextResponse } from "next/server";
import { mcpCallTool, mcpListTools } from "@/lib/server/mcp";
import { guard } from "@/lib/server/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

/** POST /api/mcp { action: "list"|"call", endpoint, authToken?, tool?, arguments? } */
export async function POST(req) {
  const blocked = guard(req, { name: "mcp" });
  if (blocked) return blocked;
  const b = await req.json().catch(() => null);
  if (!b || typeof b.endpoint !== "string") return NextResponse.json({ ok: false, error: "endpoint is required." }, { status: 400 });
  try {
    if (b.action === "list") return NextResponse.json({ ok: true, tools: await mcpListTools(b.endpoint, b.authToken) });
    if (b.action === "call") {
      if (!b.tool) return NextResponse.json({ ok: false, error: "tool is required." }, { status: 400 });
      return NextResponse.json({ ok: true, result: await mcpCallTool(b.endpoint, b.authToken, String(b.tool), b.arguments) });
    }
    return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || "MCP request failed." }, { status: 502 });
  }
}
