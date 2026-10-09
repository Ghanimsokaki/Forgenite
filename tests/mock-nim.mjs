/* Mock OpenAI-compatible NVIDIA NIM server for tests & offline demos.
 *   node tests/mock-nim.mjs [port]
 * Behaviour:
 *  - GET  /v1/models              → small model list
 *  - POST /v1/chat/completions    → SSE stream
 *      * model "mock/fail-404"    → 404 error
 *      * agent prompts (system contains "Forgenite Agent"):
 *          first turn  → batch write_file index.html + style.css
 *          after OBS   → run_javascript once, then final
 *      * otherwise echoes "Echo: <last user message>" with a reasoning delta
 */
import http from "node:http";

const port = Number(process.argv[2] || process.env.MOCK_NIM_PORT || 4010);

function sse(res, chunks) {
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
  let i = 0;
  const send = () => {
    if (i >= chunks.length) {
      res.write("data: [DONE]\n\n");
      return res.end();
    }
    res.write(`data: ${JSON.stringify({ choices: [{ delta: chunks[i++] }] })}\n\n`);
    setTimeout(send, 5);
  };
  send();
}

function split(text, n = 24) {
  const out = [];
  for (let i = 0; i < text.length; i += n) out.push({ content: text.slice(i, i + n) });
  return out;
}

const SITE_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mock Coffee</title><link rel="stylesheet" href="style.css"></head>
<body><header><h1>Mock Coffee</h1></header><main><p id="msg">Fresh beans daily.</p></main>
<script src="app.js"></script></body></html>`;

http
  .createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (!/^Bearer \S+/.test(req.headers.authorization || "")) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: { message: "missing key" } }));
      }
      if (req.method === "GET" && req.url.startsWith("/v1/models")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ data: [{ id: "mock/echo" }, { id: "z-ai/glm-5.3" }, { id: "nvidia/nv-embed-v2" }] }));
      }
      if (req.method === "POST" && req.url.startsWith("/v1/chat/completions")) {
        const j = JSON.parse(body || "{}");
        if (j.model === "mock/fail-404") {
          res.writeHead(404, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: { message: "Function not found for account" } }));
        }
        const msgs = j.messages || [];
        const sys = msgs.find((m) => m.role === "system")?.content || "";
        const last = msgs[msgs.length - 1]?.content || "";
        if (sys.includes("Forgenite Agent")) {
          const obsCount = msgs.filter((m) => m.role === "user" && m.content.startsWith("OBSERVATION")).length;
          let reply;
          if (/maximum number of steps/.test(last)) reply = { thought: "wrap up", final: "Summary after step limit." };
          else if (obsCount === 0 && /CURRENT PROJECT FILES/.test(msgs[1]?.content || "")) {
            reply = { thought: "inspect", action: { tool: "read_file", input: { path: "index.html" } } };
          } else if (obsCount === 0) {
            reply = {
              thought: "Write the site files in one batch.",
              actions: [
                { tool: "write_file", input: { path: "index.html", content: SITE_HTML } },
                { tool: "write_file", input: { path: "style.css", content: "body{font-family:sans-serif;background:#111;color:#eee}h1{color:#76b900}" } },
                { tool: "write_file", input: { path: "app.js", content: "document.getElementById('msg').textContent += ' (JS ran)';" } },
              ],
            };
          } else if (obsCount === 1) {
            reply = { thought: "Verify a calculation.", action: { tool: "run_javascript", input: { code: "const x = [1,2,3].reduce((a,b)=>a+b,0); console.log('sum', x); x*2" } } };
          } else {
            reply = { thought: "Done.", final: `Built the site. Last observation:\n${last.slice(0, 200)}` };
          }
          return sse(res, [{ reasoning_content: "planning… " }, ...split(JSON.stringify(reply), 40)]);
        }
        return sse(res, [{ reasoning_content: "Thinking about it. " }, ...split(`Echo: ${last}`)]);
      }
      res.writeHead(404);
      res.end();
    });
  })
  .listen(port, () => console.log(`mock NIM listening on :${port}`));
