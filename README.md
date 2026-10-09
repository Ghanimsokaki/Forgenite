# ⚡ Forgenite 3

**Your own AI workspace on [NVIDIA NIM](https://build.nvidia.com): chat with 90+ frontier models, let an autonomous agent do the work, build & publish websites with AI, and schedule automations that run 24/7.**

| | |
|---|---|
| 💬 **Chat** | Streaming chat with GLM-5.3, Kimi K3, DeepSeek V4, Nemotron 3, GPT-OSS, Llama 4, Qwen3, MiniMax… with collapsible reasoning ("thinking") blocks |
| 🤖 **Agent** | Autonomous loop: plans, searches the web, reads pages, runs JavaScript in a secure sandbox, writes multi-file projects, calls your MCP tools |
| 🛠️ **Web Builder** | File tree + VS Code editor (Monaco) + live, sandboxed preview with device sizes and console. Templates, "describe it and the AI builds it", AI edits of existing files, **Fix with AI** for console errors, undo, ZIP export, **one-click publish** to `/s/<id>/`, push to GitHub in one commit |
| ⏰ **Automations (24/7)** | Server-side scheduled agents (interval / daily / weekly / cron). Run history, Discord/Slack/webhook notifications ("every run", "on change", "on error"), and **auto-updating websites** (the agent edits a published site on a schedule) |
| 🔌 **Integrations** | GitHub (PAT), MCP servers (Streamable HTTP, proxied server-side — no CORS needed) |
| 🔒 **Security** | QuickJS-WASM sandbox, SSRF-safe fetching, sandboxed previews & published sites, optional password, same-origin + rate-limited APIs |

---

## 🚀 Quick start (local)

```bash
git clone https://github.com/Ghanimsokaki/Forgenite.git
cd Forgenite
npm install
cp .env.example .env.local      # paste your nvapi-… key into NVIDIA_API_KEY
npm run dev                     # http://localhost:3000
```

No key yet? Get a free one at **[build.nvidia.com](https://build.nvidia.com)** → any model → *Get API Key*. You can also paste it into **Settings** (stored only in your browser).

**Try it with no key at all:** `npm run mock:nim` in one terminal, then
`NVIDIA_API_KEY=x NVIDIA_BASE_URL=http://127.0.0.1:4010/v1 npm run dev` in another. A mock model answers instantly.

---

## ⏰ Running it 24/7

Automations run **inside the server process**: a scheduler starts with the server and checks for due jobs every 20 s. You need a host that keeps a Node process running, plus a disk for `./data`.

### Option A — any VPS / home server with PM2 (recommended)

```bash
npm ci && npm run build
cp .env.example .env            # set NVIDIA_API_KEY, FORGENITE_PASSWORD, …
npm i -g pm2
pm2 start ecosystem.config.cjs  # auto-restarts on crash
pm2 save && pm2 startup         # survive reboots
```

### Option B — Docker (Railway, Render, Fly.io, any VPS)

```bash
docker compose up -d --build    # data persists in the "forgenite-data" volume
```

On Railway, Render or Fly, deploy the repo as a Docker service. Mount a volume at `/data` and set the env vars.

### Option C — Vercel / Netlify (serverless)

Serverless functions don't stay running and their disk is temporary, so:

* `vercel.json` already contains a **Vercel Cron** that calls `/api/cron` every 5 minutes. Set `CRON_SECRET` in your Vercel project settings.
* …or use the included GitHub Action **`docs/github-workflows/heartbeat.yml`** (copy it to `.github/workflows/`). Set the repo secrets `FORGENITE_URL` and `CRON_SECRET`.
* ⚠️ Automations, run history and published sites are stored on temporary disk on serverless hosts and **will be lost**. For real 24/7 use, choose A or B.

### Health check

`GET /api/health` returns `{ ok, uptime, scheduler: { started, lastTick, running } }`. Point UptimeRobot (or similar) at it.

---

## 🔐 Security model

* **Code execution**: the agent's `run_javascript` runs in **QuickJS compiled to WebAssembly**, a separate JS engine. It has no `process`, `require`, file system or network access, a 3 s deadline (which also covers promise jobs) and a 64 MB memory cap. Earlier versions used `node:vm`, which allowed a full server takeover.
* **SSRF**: `open_url`, MCP calls and webhooks resolve DNS first and reject private, loopback, link-local, metadata and IPv6-internal ranges. Redirects are followed manually and every hop is checked again.
* **Previews**: every preview runs in an `<iframe sandbox>` **without** `allow-same-origin`, which applies to the Builder preview, "Preview in new tab" and the agent file viewer. Published sites are served with `Content-Security-Policy: sandbox …`. Generated code can never read your API keys from localStorage.
* **Links** in model output: only `http(s)`, `mailto`, `#` and `/` links are rendered. `javascript:` and `data:` links are stripped.
* **API**: cross-origin requests are rejected, and each IP is rate-limited (`FORGENITE_RATE_LIMIT`).
* **Password**: set `FORGENITE_PASSWORD` to protect the whole workspace with a signed, httpOnly session cookie. Published sites (`/s/*`), `/api/health` and the secret-protected `/api/cron` stay public.
* Automation API keys and MCP tokens are stored server-side and never sent back to the browser.

> If you deploy publicly **without** `FORGENITE_PASSWORD`, anyone who finds the URL can use your `NVIDIA_API_KEY` quota and create automations. Set a password.

---

## ⚙️ Configuration

See [`.env.example`](./.env.example) for every option. The main ones:

| Variable | Purpose |
|---|---|
| `NVIDIA_API_KEY` | Server-side NIM key (required for 24/7 automations) |
| `FORGENITE_PASSWORD` / `FORGENITE_SESSION_SECRET` | Password-protect the workspace |
| `CRON_SECRET` | Secret for the `/api/cron` heartbeat |
| `FORGENITE_DATA_DIR` | Where automations, run history and sites are stored (default `./data`) |
| `FORGENITE_TICK_SECONDS`, `FORGENITE_AUTOMATION_CONCURRENCY`, `FORGENITE_AUTOMATION_TIMEOUT_MS` | Scheduler tuning |
| `NVIDIA_BASE_URL` | Any OpenAI-compatible endpoint (self-hosted NIM, the mock) |

---

## 🧪 Tests

```bash
npm test                         # unit: sandbox escapes, SSRF, scheduler math, agent loop, JSON repair, link safety
npm run build && npm run test:e2e  # boots mock NIM + real server: chat streaming, tools, security, sites, automations, scheduler, cron
```

CI (`docs/github-workflows/ci.yml`; copy it to `.github/workflows/`) runs `npm ci`, the unit tests, the build and the e2e tests on every push and pull request.

---

## 🏗 Architecture

```
app/
  page.js                    Chat & Agent UI + navigation (Chat · Web Builder · Automations)
  login/page.js              password screen (when FORGENITE_PASSWORD is set)
  s/[id]/[[...path]]/route.js  serves published sites (CSP-sandboxed)
  api/chat                   streaming proxy → NIM (reasoning → <think>)
  api/models                 live model list (cached) / curated fallback
  api/tools                  web_search · open_url · run_javascript
  api/mcp                    MCP proxy (tools/list, tools/call)
  api/sites[/id]             publish / list / delete hosted sites
  api/automations[/id[/run|/stop]]  CRUD + run now + stop
  api/cron                   external heartbeat (CRON_SECRET)
  api/health                 liveness + scheduler status
  api/auth                   login / logout
components/
  WebBuilder.js              builder: projects, files, Monaco, preview, console, AI, publish, GitHub
  Automations.js             automations dashboard + editor + run history
  AgentRun.js · FileViewer.js · Markdown.js · ModelPicker.js · Settings.js
  GitHubConnectionModal.js · MCPConnectionModal.js
lib/
  agentCore.js               the ONE agent loop (browser agent, builder AI and server automations)
  agent.js                   browser transport (/api/chat, /api/tools, /api/mcp)
  preview.js                 bundles multi-file projects into one sandboxed document
  schedule.js                interval/daily/weekly/cron parsing + next-run math
  templates.js · projects.js · fileUtils.js · github.js · mcp.js · models.js · safeUrl.js
  server/
    sandbox.js               QuickJS-WASM code runner
    net.js                   SSRF-safe fetch
    nim.js                   NIM client (shared by chat + automations)
    tools.js                 server tools
    automations.js           scheduler + runner + notifications
    sites.js · store.js      durable JSON storage (atomic writes)
    mcp.js · guard.js · auth.js
instrumentation.js           starts the scheduler when the server boots
middleware.js                optional password gate
ecosystem.config.cjs · Dockerfile · docker-compose.yml · vercel.json
tests/                       unit.test.mjs · e2e.mjs · mock-nim.mjs
```

## 🛠 Troubleshooting

| Problem | Fix |
|---|---|
| **401** "No NVIDIA API key configured" | Set `NVIDIA_API_KEY`, or paste a key in Settings |
| **401/403** "Authorization failed" | Re-copy the key; open the model on build.nvidia.com and click **Try API** once |
| **404** "Not found for account" | That model isn't enabled for your key. Pick another (the live list shows what you can call) |
| **429** | Free tier is about 40 requests/min across all models. Wait, or raise the automation interval |
| Automations never run | Check the green "Scheduler running" dot on the Automations page. On serverless hosts, set up the cron heartbeat |
| An automation shows "Paused automatically" | It failed 5 times in a row. Check its run history, fix the task or model, then re-enable it |

More on secrets: [SECRETS.md](./SECRETS.md) · License: [LICENSE](./LICENSE)
