/* Builds a single self-contained HTML document from a multi-file project so
 * it can be shown in a sandboxed iframe (srcdoc, opaque origin — no access to
 * Forgenite's localStorage, cookies or APIs).
 *  - <link rel=stylesheet href="local.css">  → inlined <style>
 *  - <script src="local.js">                 → inlined <script>
 *  - CSS/JS files not referenced anywhere    → appended (old behaviour)
 *  - clicks on local *.html links            → postMessage to parent to switch page
 *  - console.* and errors                    → postMessage to parent console
 */

const isHtml = (p) => /\.html?$/i.test(p);

function norm(base, ref) {
  if (/^(https?:)?\/\//i.test(ref) || /^(data|blob|mailto|tel|javascript):/i.test(ref) || ref.startsWith("#")) return null;
  const clean = ref.split(/[?#]/)[0];
  const parts = (clean.startsWith("/") ? [] : base.split("/").slice(0, -1)).concat(clean.split("/"));
  const out = [];
  for (const p of parts) {
    if (!p || p === ".") continue;
    if (p === "..") out.pop();
    else out.push(p);
  }
  return out.join("/");
}

const esc = (s) => s.replace(/<\/(script)/gi, "<\\/$1");

export function pickEntry(files, preferred) {
  if (preferred && files.some((f) => f.path === preferred && isHtml(f.path))) return preferred;
  return (files.find((f) => f.path === "index.html") || files.find((f) => isHtml(f.path)))?.path || null;
}

const BRIDGE = `<script>(function(){
var P=parent;function s(t,a){try{P.postMessage({__forgenite:1,type:t,args:a},"*")}catch(e){}}
["log","info","warn","error"].forEach(function(l){var o=console[l];console[l]=function(){var a=[].slice.call(arguments).map(function(x){try{return typeof x==="string"?x:JSON.stringify(x)}catch(e){return String(x)}});s("console",[l].concat(a));o&&o.apply(console,arguments)}});
addEventListener("error",function(e){s("console",["error",(e.message||"Error")+(e.lineno?" (line "+e.lineno+")":"")])});
addEventListener("unhandledrejection",function(e){s("console",["error","Unhandled promise rejection: "+(e.reason&&e.reason.message||e.reason)])});
document.addEventListener("click",function(e){var a=e.target.closest&&e.target.closest("a[href]");if(!a)return;var h=a.getAttribute("href");if(!h||/^(https?:|mailto:|tel:|#|javascript:)/i.test(h))return;if(/\\.html?([?#].*)?$/i.test(h)){e.preventDefault();s("navigate",[h])}},true);
})();</script>`;

export function buildPreviewHtml(files, entryPath) {
  const map = new Map(files.map((f) => [f.path, f.content]));
  const entry = pickEntry(files, entryPath);
  if (!entry) {
    return `<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;color:#8b98a9;background:#0c1219;display:grid;place-items:center;height:100vh;margin:0"><p>No HTML file in this project yet — add an <code>index.html</code> or ask the AI to build one.</p>`;
  }
  const used = new Set([entry]);
  let html = map.get(entry);

  html = html.replace(/<link\b[^>]*>/gi, (tag) => {
    if (!/rel\s*=\s*["']?stylesheet/i.test(tag)) return tag;
    const m = /href\s*=\s*["']([^"']+)["']/i.exec(tag);
    const p = m && norm(entry, m[1]);
    if (!p || !map.has(p)) return tag;
    used.add(p);
    return `<style data-file="${p}">\n${map.get(p).replace(/<\/style/gi, "<\\/style")}\n</style>`;
  });

  html = html.replace(/<script\b([^>]*)\bsrc\s*=\s*["']([^"']+)["']([^>]*)>\s*<\/script>/gi, (tag, a, src, b) => {
    const p = norm(entry, src);
    if (!p || !map.has(p)) return tag;
    used.add(p);
    const attrs = (a + b).replace(/\s+(defer|async)\b/gi, "");
    return `<script${attrs} data-file="${p}">\n${esc(map.get(p))}\n</script>`;
  });

  const extraCss = files.filter((f) => /\.css$/i.test(f.path) && !used.has(f.path));
  const extraJs = files.filter((f) => /\.m?js$/i.test(f.path) && !used.has(f.path) && !/\.(test|spec|config)\./.test(f.path));
  const css = extraCss.map((f) => `<style data-file="${f.path}">\n${f.content}\n</style>`).join("\n");
  const js = extraJs.map((f) => `<script data-file="${f.path}">\n${esc(f.content)}\n</script>`).join("\n");

  const inject = (src, re, add, fallback) => (re.test(src) ? src.replace(re, (m) => (fallback === "before" ? add + m : m + add)) : null);
  let out = inject(html, /<head[^>]*>/i, BRIDGE) ?? BRIDGE + html;
  if (css) out = inject(out, /<\/head>/i, css, "before") ?? css + out;
  if (js) out = inject(out, /<\/body>/i, js, "before") ?? out + js;
  return out;
}
