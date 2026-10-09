/* Browser transport for the agent: model calls via /api/chat, tools via
 * /api/tools and /api/mcp. The loop itself lives in lib/agentCore.js. */
export { extractJson, sanitizePath, buildAgentPrompt, runAgentLoop, BASE_TOOLS, FILE_TOOLS } from "./agentCore.js";

export async function callChat({ messages, model, temperature, maxTokens, apiKey, signal }) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { "x-nvidia-api-key": apiKey } : {}),
    },
    body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }),
    signal,
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || `Chat request failed (${res.status}).`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let full = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    full += dec.decode(value, { stream: true });
  }
  return full;
}

export async function executeTool(tool, input, signal, { mcpServers = [] } = {}) {
  try {
    let res;
    if (tool === "mcp_call") {
      const server = mcpServers.find((s) => s.name === input.server) || mcpServers.find((s) => s.id === input.server);
      if (!server) return { ok: false, error: `MCP server "${input.server}" is not connected.` };
      res = await fetch("/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "call",
          endpoint: server.endpoint,
          authToken: server.authToken,
          tool: input.tool,
          arguments: input.arguments || {},
        }),
        signal,
      });
    } else {
      res = await fetch("/api/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool, input }),
        signal,
      });
    }
    const j = await res.json().catch(() => null);
    if (!res.ok || !j || !j.ok) return { ok: false, error: (j && j.error) || `Tool failed (${res.status}).` };
    return { ok: true, result: typeof j.result === "string" ? j.result : JSON.stringify(j.result, null, 2) };
  } catch (e) {
    if (e && e.name === "AbortError") throw e;
    return { ok: false, error: (e && e.message) || "Tool request failed." };
  }
}
