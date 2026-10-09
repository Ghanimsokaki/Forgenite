/* Abuse protection for API routes:
 *  - same-origin check (blocks other websites from using your server key)
 *  - per-IP sliding-window rate limit (in-memory, per instance)
 * Optional password protection for the whole app lives in middleware.js. */
import { NextResponse } from "next/server";

const buckets = globalThis.__forgeniteBuckets || (globalThis.__forgeniteBuckets = new Map());

export function clientIp(req) {
  const xf = req.headers.get("x-forwarded-for");
  return (xf ? xf.split(",")[0] : req.headers.get("x-real-ip")) || "local";
}

/** Returns a NextResponse to short-circuit with, or null if allowed. */
export function guard(req, { name = "api", limit = Number(process.env.FORGENITE_RATE_LIMIT || 60), windowMs = 60_000 } = {}) {
  const origin = req.headers.get("origin");
  if (origin) {
    let ok = false;
    try {
      const o = new URL(origin);
      const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
      ok = o.host === host;
      const extra = (process.env.FORGENITE_ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
      if (!ok && extra.includes(o.origin)) ok = true;
    } catch {
      ok = false;
    }
    if (!ok) return NextResponse.json({ error: "Cross-origin requests are not allowed." }, { status: 403 });
  }
  if (limit > 0) {
    const key = `${name}:${clientIp(req)}`;
    const now = Date.now();
    const arr = (buckets.get(key) || []).filter((t) => now - t < windowMs);
    if (arr.length >= limit) {
      const retry = Math.ceil((windowMs - (now - arr[0])) / 1000);
      return NextResponse.json(
        { error: `Too many requests — slow down (limit ${limit}/min). Retry in ${retry}s.` },
        { status: 429, headers: { "Retry-After": String(retry) } }
      );
    }
    arr.push(now);
    buckets.set(key, arr);
    if (buckets.size > 5000) for (const [k, v] of buckets) if (!v.length || now - v[v.length - 1] > windowMs) buckets.delete(k);
  }
  return null;
}
