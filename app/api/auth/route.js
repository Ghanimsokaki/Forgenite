import { NextResponse } from "next/server";
import { SESSION_COOKIE, checkPassword, makeSessionToken, passwordEnabled } from "@/lib/server/auth";
import { guard } from "@/lib/server/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ passwordEnabled: passwordEnabled() });
}

export async function POST(req) {
  const blocked = guard(req, { name: "auth", limit: 10 });
  if (blocked) return blocked;
  const body = await req.json().catch(() => ({}));
  if (body.logout) {
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  }
  if (!passwordEnabled()) return NextResponse.json({ ok: true });
  if (!checkPassword(body.password)) {
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json({ ok: false, error: "Wrong password." }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await makeSessionToken(), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: req.nextUrl.protocol === "https:",
    maxAge: 30 * 86400,
  });
  return res;
}
