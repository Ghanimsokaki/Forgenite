import { NextResponse } from "next/server";
import { CURATED_MODELS, publisherOf, shortName } from "@/lib/models";
import { NIM_BASE, resolveKey, serverKey } from "@/lib/server/nim";
import { guard } from "@/lib/server/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cache = globalThis.__forgeniteModelCache || (globalThis.__forgeniteModelCache = new Map());

export async function GET(req) {
  const blocked = guard(req, { name: "models", limit: 30 });
  if (blocked) return blocked;
  const hasServerKey = Boolean(serverKey());
  const key = resolveKey(req);
  if (key) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < 10 * 60_000) return NextResponse.json({ source: "live", hasServerKey, models: hit.models });
    try {
      const r = await fetch(`${NIM_BASE}/models`, { headers: { Authorization: `Bearer ${key}` }, cache: "no-store", signal: AbortSignal.timeout(10000) });
      if (r.ok) {
        const j = await r.json();
        const curated = new Map(CURATED_MODELS.map((m) => [m.id, m]));
        const models = (Array.isArray(j.data) ? j.data : [])
          .filter((m) => m.id && !/embed|rerank|guard|reward|parse|clip|vision-only|tts|asr|nv-ingest/i.test(m.id))
          .map((m) => ({ id: m.id, name: curated.get(m.id)?.name || shortName(m.id), publisher: publisherOf(m.id), description: curated.get(m.id)?.description }))
          .sort((a, b) => a.id.localeCompare(b.id));
        if (models.length) {
          cache.set(key, { at: Date.now(), models });
          return NextResponse.json({ source: "live", hasServerKey, models });
        }
      }
    } catch {
      /* fall back */
    }
  }
  return NextResponse.json({ source: "fallback", hasServerKey, models: CURATED_MODELS });
}
