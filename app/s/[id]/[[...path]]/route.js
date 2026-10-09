import { getSite } from "@/lib/server/sites";
import { mimeFromPath } from "@/lib/fileUtils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Serves published Web Builder sites at /s/<id>/<path>.
 * The CSP `sandbox` directive (without allow-same-origin) puts every page in
 * an opaque origin: scripts run, but they cannot read Forgenite's cookies,
 * localStorage (API keys!) or call its APIs as the user. */
const CSP =
  "sandbox allow-scripts allow-forms allow-popups allow-modals allow-downloads; " +
  "default-src * data: blob: 'unsafe-inline' 'unsafe-eval'; frame-ancestors *";

export async function GET(req, { params }) {
  const site = await getSite(params.id);
  if (!site) return new Response("Site not found.", { status: 404, headers: { "Content-Type": "text/plain" } });
  let p = (params.path || []).map(decodeURIComponent).join("/");
  const map = new Map(site.files.map((f) => [f.path, f.content]));
  let content = map.get(p);
  if (content === undefined && (!p || p.endsWith("/"))) content = map.get(p + "index.html");
  if (content === undefined && map.has(p + "/index.html")) {
    p = p + "/index.html";
    content = map.get(p);
  }
  if (content === undefined && !/\.[a-z0-9]+$/i.test(p)) {
    // SPA-style fallback
    p = "index.html";
    content = map.get("index.html") ?? site.files.find((f) => /\.html?$/i.test(f.path))?.content;
  }
  if (content === undefined) return new Response("Not found.", { status: 404, headers: { "Content-Type": "text/plain" } });
  const file = p || "index.html";
  let type = mimeFromPath(/\.[a-z0-9]+$/i.test(file) ? file : "index.html");
  if (/^text\/|javascript|json|xml|svg/.test(type)) type += "; charset=utf-8";
  if (/\.html?$/i.test(file) || type.startsWith("text/html")) {
    // A <base> makes relative links work no matter how the URL is written.
    const base = `<base href="/s/${site.id}/${file.includes("/") ? file.slice(0, file.lastIndexOf("/") + 1) : ""}">`;
    content = /<head[^>]*>/i.test(content) ? content.replace(/<head[^>]*>/i, (m) => m + base) : base + content;
  }
  return new Response(content, {
    headers: {
      "Content-Type": type,
      "Content-Security-Policy": CSP,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "public, max-age=30",
      "Referrer-Policy": "no-referrer",
    },
  });
}
