/* Server-side agent tools: web_search, open_url, run_javascript, http_get. */
import { safeFetch, UA } from "./net.js";
import { runJavascript } from "./sandbox.js";

function decodeEntities(s) {
  return String(s).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, e) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try {
        return String.fromCodePoint(code || 32);
      } catch {
        return " ";
      }
    }
    const map = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–", hellip: "…", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”" };
    return map[e.toLowerCase()] || m;
  });
}

const clean = (s) => decodeEntities(String(s).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

export function htmlToText(raw) {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(raw);
  let text = raw
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  text = decodeEntities(text).replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n").trim();
  return { title: title ? clean(title[1]) : "", text };
}

export async function webSearch(query) {
  try {
    const r = await fetch("https://html.duckduckgo.com/html/?q=" + encodeURIComponent(query), {
      headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "en-US,en;q=0.9" },
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
    if (r.ok) {
      const html = await r.text();
      const links = [...html.matchAll(/<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
      const snippets = [...html.matchAll(/<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g)];
      const out = [];
      for (let i = 0; i < links.length && out.length < 6; i++) {
        let href = links[i][1];
        const u = /[?&]uddg=([^&]+)/.exec(href);
        if (u) {
          try {
            href = decodeURIComponent(u[1]);
          } catch {
            /* keep */
          }
        }
        if (!/^https?:\/\//i.test(href)) continue;
        const title = clean(links[i][2]);
        const snip = snippets[i] ? clean(snippets[i][1]) : "";
        if (title) out.push(`${out.length + 1}. ${title}\n   ${href}${snip ? "\n   " + snip.slice(0, 220) : ""}`);
      }
      if (out.length) return "Web search results (DuckDuckGo):\n\n" + out.join("\n\n");
    }
  } catch {
    /* fall through */
  }
  try {
    const r = await fetch(
      "https://en.wikipedia.org/w/api.php?action=query&list=search&srlimit=5&format=json&srsearch=" + encodeURIComponent(query),
      { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10000), cache: "no-store" }
    );
    if (r.ok) {
      const j = await r.json();
      const items = j?.query?.search || [];
      const out = items.map(
        (it, i) => `${i + 1}. ${it.title}\n   https://en.wikipedia.org/?curid=${it.pageid}\n   ${clean(it.snippet || "").slice(0, 220)}`
      );
      if (out.length) return "Web search results (Wikipedia):\n\n" + out.join("\n\n");
    }
  } catch {
    /* fall through */
  }
  return "No results found. Try a different query.";
}

export async function openUrl(url) {
  const r = await safeFetch(url, {
    headers: { Accept: "text/html,application/xhtml+xml,text/plain,application/json;q=0.9,*/*;q=0.7" },
    maxBytes: 400_000,
  });
  const ct = r.headers.get("content-type") || "";
  if (ct.includes("json") || ct.includes("text/plain") || ct.includes("xml") || ct.includes("csv")) {
    return `URL: ${r.url}\nStatus: ${r.status}\n\n${r.text.slice(0, 6000)}${r.text.length > 6000 ? "\n\n… (truncated)" : ""}`;
  }
  const { title, text } = htmlToText(r.text);
  return `Title: ${title || "(none)"}\nURL: ${r.url}\nStatus: ${r.status}\n\n${text.slice(0, 6000)}${
    text.length > 6000 ? "\n\n… (page truncated)" : ""
  }`;
}

export const SERVER_TOOLS = ["web_search", "open_url", "run_javascript"];

/** Execute a server tool. Returns { ok, result } | { ok:false, error }. */
export async function executeServerTool(tool, input) {
  const i = input && typeof input === "object" ? input : {};
  try {
    if (tool === "web_search") {
      const q = String(i.query || "").trim().slice(0, 300);
      if (!q) return { ok: false, error: "input.query is required." };
      return { ok: true, result: await webSearch(q) };
    }
    if (tool === "open_url") {
      const url = String(i.url || "").trim().slice(0, 2000);
      if (!/^https?:\/\//i.test(url)) return { ok: false, error: "input.url must be an http(s) URL." };
      return { ok: true, result: await openUrl(url) };
    }
    if (tool === "run_javascript") {
      const code = String(i.code || "");
      if (!code.trim()) return { ok: false, error: "input.code is required." };
      if (code.length > 30000) return { ok: false, error: "Code too long (30,000 character limit)." };
      return { ok: true, result: await runJavascript(code) };
    }
    return { ok: false, error: `Unknown tool "${tool}".` };
  } catch (e) {
    return { ok: false, error: (e && e.message) || "Tool failed." };
  }
}
