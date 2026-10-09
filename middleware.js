import { NextResponse } from "next/server";
import { SESSION_COOKIE, passwordEnabled, verifySessionToken } from "@/lib/server/auth";

const PUBLIC = [/^\/s\//, /^\/login$/, /^\/api\/auth$/, /^\/api\/health$/, /^\/api\/cron$/, /^\/_next\//, /^\/icon\.svg$/, /^\/favicon/];

export async function middleware(req) {
  if (!passwordEnabled()) return NextResponse.next();
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((re) => re.test(pathname))) return NextResponse.next();
  const ok = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (ok) return NextResponse.next();
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
