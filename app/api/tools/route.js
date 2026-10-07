import { NextResponse } from "next/server";
import vm from "node:vm";
import util from "node:util";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 Forgenite/1.0";

/* ---------------- text utils ---------------- */

function decodeEntities(s) {
  return String(s).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, e) => {
    if (e[0] === "#") {
      const code =
        e[1] === "x" || e[1] === "X"
          ? parseInt(e.slice(2), 16)
          : parseInt(e.slice(1), 10);
      try {
        return String.fromCodePoint(code || 32);
      } catch {
        return " ";
      }
    }
    const map = {
      amp: "&",
      lt: "<",
      gt: ">",
      quot: '"',
      apos: "'",
      nbsp: " ",
      mdash: "—",
      ndash: "–",
      hellip: "…",
      rsquo: "’",
      lsquo: "‘",
      ldquo: "“",
      rdquo: "”",
    };
    return map[e.toLowerCase()] || m;
  });
}

function clean(s) {
  return decodeEntities(String(s).replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function isBlockedHost(hostname) {
  const h = String(hostname || "").toLowerCase();
  if (!h) return true;
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (h === "::1" || h === "[::1]" || h.includes("metadata")) return true;
  return false;
}

/* ---------------- tools ---------------- */

async function webSearch(query) {
  // Primary: DuckDuckGo HTML endpoint (no key needed).
  try {
    const r = await fetch("https://html.duckduckgo.com/html/?q=" + encodeURIComponent(query), {
      headers: {
        "User-Agent": UA,
        Accept: "text/html",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
    if (r.ok) {
      const html = await r.text();
      const links = [
        ...html.matchAll(
          /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g
        ),
      ];
      const snippets = [
        ...html.matchAll(
          /<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g
        ),
      ];
      const out = [];
      for (let i = 0; i < links.length && out.length < 6; i++) {
        let href = links[i][1];
        const u = /[?&]uddg=([^&]+)/.exec(href);
        if (u) {
          try {
            href = decodeURIComponent(u[1]);
          } catch {
            /* keep raw */
          }
        }
        if (!/^https?:\/\//i.test(href)) continue;
        const title = clean(links[i][2]);
        const snip = snippets[i] ? clean(snippets[i][1]) : "";
        if (title) {
          out.push(
            `${out.length + 1}. ${title}\n   ${href}${snip ? "\n   " + snip.slice(0, 220) : ""}`
          );
        }
      }
      if (out.length) return "Web search results (DuckDuckGo):\n\n" + out.join("\n\n");
    }
  } catch {
    /* fall through to Wikipedia */
  }

  // Fallback: Wikipedia search API (also keyless).
  try {
    const r = await fetch(
      "https://en.wikipedia.org/w/api.php?action=query&list=search&srlimit=5&srsearch=" +
        encodeURIComponent(query) +
        "&format=json",
      {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(10000),
        cache: "no-store",
      }
    );
    if (r.ok) {
      const j = await r.json();
      const items = (j && j.query && j.query.search) || [];
      const out = items.map(
        (it, i) =>
          `${i + 1}. ${it.title}\n   https://en.wikipedia.org/?curid=${it.pageid}\n   ${clean(
            it.snippet || ""
          ).slice(0, 220)}`
      );
      if (out.length) return "Web search results (Wikipedia):\n\n" + out.join("\n\n");
    }
  } catch {
    /* fall through */
  }

  return "No results found. Try a different query.";
}

async function openUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return "Error: invalid URL.";
  }
  if (!/^https?:$/.test(u.protocol)) return "Error: only http(s) URLs are allowed.";
  if (isBlockedHost(u.hostname)) return "Error: this host is not allowed.";

  const r = await fetch(u, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,text/plain,application/json;q=0.9,*/*;q=0.7",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(12000),
    cache: "no-store",
  });
  const status = r.status;
  const ct = r.headers.get("content-type") || "";
  const raw = (await r.text()).slice(0, 400000);

  if (ct.includes("json") || ct.includes("text/plain")) {
    return `URL: ${u.href}\nStatus: ${status}\n\n${raw.slice(0, 6000)}`;
  }

  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(raw);
  let text = raw
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  text = decodeEntities(text)
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();

  return `Title: ${title ? clean(title[1]) : "(none)"}\nURL: ${u.href}\nStatus: ${status}\n\n${text.slice(
    0,
    6000
  )}${text.length > 6000 ? "\n\n… (page truncated)" : ""}`;
}

function runJavascript(code) {
  const logs = [];
  const fmt = (v) => {
    try {
      return typeof v === "string"
        ? v
        : util.inspect(v, { depth: 4, maxArrayLength: 50, breakLength: 100 });
    } catch {
      return String(v);
    }
  };
  const sandboxConsole = {
    log: (...a) => logs.push(a.map(fmt).join(" ")),
    info: (...a) => logs.push(a.map(fmt).join(" ")),
    warn: (...a) => logs.push(a.map(fmt).join(" ")),
    error: (...a) => logs.push("ERROR " + a.map(fmt).join(" ")),
  };
  const ctx = vm.createContext({ console: sandboxConsole });
  let result;
  try {
    result = new vm.Script(String(code)).runInContext(ctx, { timeout: 3000 });
  } catch (e) {
    return `Code threw: ${e && e.message ? e.message : e}\n\nConsole output:\n${
      logs.join("\n").slice(0, 4000) || "(empty)"
    }`;
  }
  let out = logs.join("\n");
  if (out.length > 8000) out = out.slice(0, 8000) + "\n… (output truncated)";
  if (result !== undefined) out += (out ? "\n" : "") + "=> " + fmt(result);
  return out || "(no output — use console.log() or end with an expression value)";
}

/* ---------------- route ---------------- */

export async function POST(req) {
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
  const i = input && typeof input === "object" ? input : {};

  try {
    if (tool === "web_search") {
      const q = String(i.query || "").trim().slice(0, 300);
      if (!q) {
        return NextResponse.json({ ok: false, error: "input.query is required." }, { status: 400 });
      }
      return NextResponse.json({ ok: true, result: await webSearch(q) });
    }

    if (tool === "open_url") {
      const url = String(i.url || "").trim().slice(0, 2000);
      if (!/^https?:\/\//i.test(url)) {
        return NextResponse.json(
          { ok: false, error: "input.url must be an http(s) URL." },
          { status: 400 }
        );
      }
      return NextResponse.json({ ok: true, result: await openUrl(url) });
    }

    if (tool === "run_javascript") {
      const code = String(i.code || "");
      if (!code.trim()) {
        return NextResponse.json({ ok: false, error: "input.code is required." }, { status: 400 });
      }
      if (code.length > 30000) {
        return NextResponse.json(
          { ok: false, error: "Code too long (30,000 character limit)." },
          { status: 400 }
        );
      }
      return NextResponse.json({ ok: true, result: runJavascript(code) });
    }

    return NextResponse.json({ ok: false, error: `Unknown tool "${tool}".` }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e && e.message) || "Tool failed." },
      { status: 502 }
    );
  }
}
