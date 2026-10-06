import { NextResponse } from "next/server";
import { CURATED_MODELS, publisherOf, shortName } from "@/lib/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NIM_MODELS_URL = "https://integrate.api.nvidia.com/v1/models";

/**
 * GET /api/models
 * Returns the catalogue of chat models. With a key (browser header or server
 * env) it returns the LIVE list from NVIDIA NIM; otherwise it falls back to a
 * curated preset list. Also reports whether the server has NVIDIA_API_KEY set.
 */
export async function GET(req) {
  const hasServerKey = Boolean((process.env.NVIDIA_API_KEY || "").trim());
  const key =
    (req.headers.get("x-nvidia-api-key") || "").trim() ||
    (process.env.NVIDIA_API_KEY || "").trim();

  if (key) {
    try {
      const r = await fetch(NIM_MODELS_URL, {
        headers: { Authorization: `Bearer ${key}` },
        cache: "no-store",
      });
      if (r.ok) {
        const j = await r.json();
        const models = (Array.isArray(j.data) ? j.data : [])
          .map((m) => ({
            id: m.id,
            name: shortName(m.id),
            publisher: publisherOf(m.id),
          }))
          .filter((m) => m.id)
          .sort((a, b) => a.id.localeCompare(b.id));

        if (models.length) {
          return NextResponse.json({ source: "live", hasServerKey, models });
        }
      }
    } catch {
      // fall through to preset list
    }
  }

  return NextResponse.json({
    source: "fallback",
    hasServerKey,
    models: CURATED_MODELS,
  });
}
