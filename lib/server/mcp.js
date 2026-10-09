/* Server-side MCP (Model Context Protocol) client over Streamable HTTP.
 * Proxying through the server avoids CORS problems and lets automations use
 * MCP tools. Every request goes through the SSRF-guarded safeFetch. */
import { safeFetch } from "./net.js";

function parseRpc(text, contentType) {
  if ((contentType || "").includes("text/event-stream")) {
    let last = null;
    for (const line of text.split("\n")) {
      if (line.startsWith("data:")) {
        try {
          const obj = JSON.parse(line.slice(5).trim());
          if (obj && (obj.result !== undefined || obj.error)) last = obj;
        } catch {
          /* ignore */
        }
      }
    }
    return last;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function rpc(endpoint, authToken, sessionId, method, params, id) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    "MCP-Protocol-Version": "2025-06-18",
  };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;
  const body = JSON.stringify(id === undefined ? { jsonrpc: "2.0", method, params } : { jsonrpc: "2.0", id, method, params });
  const r = await safeFetch(endpoint, { method: "POST", headers, body, timeoutMs: 30000, maxBytes: 2_000_000 });
  if (id === undefined) return { status: r.status };
  if (!r.ok) throw new Error(`MCP server returned HTTP ${r.status}${r.text ? ": " + r.text.slice(0, 200) : ""}`);
  const data = parseRpc(r.text, r.headers.get("content-type"));
  if (!data) throw new Error("MCP server returned an unreadable response.");
  if (data.error) throw new Error(data.error.message || "MCP error");
  return { result: data.result, sessionId: r.headers.get("mcp-session-id") || sessionId };
}

async function session(endpoint, authToken) {
  const init = await rpc(endpoint, authToken, null, "initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "forgenite", version: "3.0.0" },
  }, 1).catch((e) => {
    // Some simple JSON-RPC servers don't implement initialize — continue sessionless.
    if (/HTTP 4\d\d|Method not found/i.test(e.message)) return { sessionId: null };
    throw e;
  });
  if (init.sessionId !== undefined) {
    await rpc(endpoint, authToken, init.sessionId, "notifications/initialized", {}).catch(() => {});
  }
  return init.sessionId || null;
}

export async function mcpListTools(endpoint, authToken) {
  const sid = await session(endpoint, authToken);
  const { result } = await rpc(endpoint, authToken, sid, "tools/list", {}, 2);
  return (result?.tools || []).map((t) => ({ name: t.name, description: t.description || "", inputSchema: t.inputSchema }));
}

export async function mcpCallTool(endpoint, authToken, tool, args) {
  const sid = await session(endpoint, authToken);
  const { result } = await rpc(endpoint, authToken, sid, "tools/call", { name: tool, arguments: args || {} }, 3);
  if (Array.isArray(result?.content)) {
    const text = result.content
      .map((c) => (c.type === "text" ? c.text : c.type === "resource" ? JSON.stringify(c.resource) : `[${c.type}]`))
      .join("\n");
    return (result.isError ? "MCP tool reported an error:\n" : "") + text.slice(0, 12000);
  }
  return JSON.stringify(result, null, 2).slice(0, 12000);
}
