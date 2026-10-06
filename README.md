# ⚡ Forgenite

**Chat with 20+ frontier AI models — one clean web app, powered by the [NVIDIA NIM](https://build.nvidia.com) API, deployed on [Vercel](https://vercel.com).**

Forgenite is a streaming chatbot that gives you a single interface to every model hosted on NVIDIA NIM — Llama 3.3 / 3.1 (8B → 405B), NVIDIA Nemotron, DeepSeek R1, Qwen 2.5, Mistral Large / Mixtral, Gemma 2, Phi 3.5 and many more. Pick a model from the dropdown and talk.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FGhanimsokaki%2FForgenite&env=NVIDIA_API_KEY&project-name=forgenite)

---

## ✨ Features

- 💬 **Real-time streaming chat** — replies stream token-by-token via Server-Sent Events, with a stop button
- 🤖 **Model picker with the full AI list** — a curated preset of popular models out of the box, and the **live catalogue of every NIM model** (100+) once an API key is configured, searchable by name or publisher
- 🗂 **Conversation history** — multiple chats saved in your browser (localStorage), with delete + auto-titles
- ⚙️ **Settings** — system prompt, temperature, max tokens
- 🔑 **Two ways to authenticate** — server-side `NVIDIA_API_KEY` env var (recommended, never leaves the server) or a personal key pasted into Settings (stored only in your browser)
- 📝 **Markdown rendering** — code blocks with copy buttons, lists, headings, links
- 📱 **Responsive** — works on desktop and mobile
- 🚀 **Zero-config Vercel deploy** — pure Next.js App Router, no database, no extra services

## 🚀 Deploy on Vercel

### Option A — one click

1. Click the **Deploy** button above (or [this link](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FGhanimsokaki%2FForgenite&env=NVIDIA_API_KEY&project-name=forgenite)).
2. When prompted, paste your `NVIDIA_API_KEY` (get a free one at **[build.nvidia.com](https://build.nvidia.com)** — sign in, pick any model, click *Get API Key*).
3. Deploy. Done — your chatbot is live on `https://<your-project>.vercel.app`.

### Option B — connect the GitHub repo

1. Push this repo to GitHub (it already lives at [Ghanimsokaki/Forgenite](https://github.com/Ghanimsokaki/Forgenite)).
2. On [vercel.com/new](https://vercel.com/new), **import** the `Forgenite` repository.
3. Vercel auto-detects Next.js — no build settings needed.
4. Add the environment variable:

   | Name             | Value                              |
   | ---------------- | ---------------------------------- |
   | `NVIDIA_API_KEY` | `nvapi-...` (from build.nvidia.com) |

5. Click **Deploy**.

Every push (or merged pull request) to `main` automatically redeploys the site.

## 💻 Run locally

```bash
git clone https://github.com/Ghanimsokaki/Forgenite.git
cd Forgenite
npm install
cp .env.example .env.local   # then paste your nvapi-... key inside
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

> You can also skip `.env.local` entirely and paste a key in the app's **Settings** dialog — it's stored only in your browser.

## 🔑 Getting an NVIDIA NIM API key

1. Go to [build.nvidia.com](https://build.nvidia.com) and sign in (free).
2. Open any model and click **Get API Key**.
3. Copy the `nvapi-...` key and either:
   - set it as the `NVIDIA_API_KEY` environment variable on Vercel (recommended), or
   - paste it into Forgenite's **Settings → NVIDIA API key**.

The free tier includes credits that are plenty for personal use.

## 🏗 How it works

```
                        ┌───────────────────────────────────────────────┐
                        │                Browser (React)                │
                        │  Chat mode          Agent mode                │
                        │  ┌─────────────┐    ┌──────────────────────┐  │   tools: web_search,
                        │  │ stream reply │    │ autonomous loop:     │  │   open_url, run_javascript
                        │  └──────┬──────┘    │ think → act → watch  │  │
                        │         │           └──────────┬───────────┘  │
                        └─────────┼──────────────────────┼──────────────┘
                     /api/chat    │                /api/chat ─┐   /api/tools
                                  ▼                            ▼          ▼
                        ┌──────────────────┐   ┌──────────────────┐ ┌──────────────┐
                        │ Next.js API route │▶ │  NVIDIA NIM API  │ │ DuckDuckGo / │
                        │ (streaming proxy) │◀ │ (chat models)    │ │ Wikipedia /  │
                        └──────────────────┘   └──────────────────┘ │ page fetch / │
                                                                     │ JS sandbox   │
                                                                     └──────────────┘
```

- The browser never talks to NVIDIA directly — the API key stays on the server.
- `app/api/chat/route.js` proxies `POST https://integrate.api.nvidia.com/v1/chat/completions` with `stream: true`, parses the SSE and forwards plain-text deltas to the browser.
- `app/api/models/route.js` returns the live model catalogue from `GET /v1/models` (falls back to the curated list in `lib/models.js` when no key is set).
- **Agent mode** (`lib/agent.js`) runs the autonomy loop *in the browser*: each model turn is a short `/api/chat` call (so no serverless time limits), the reply is a strict JSON protocol (`{"thought","action"}` / `{"thought","final"}`), and tool calls dispatch to `/api/tools` (server) or to local artifact storage (`write_file`/`append_file`). The loop runs unattended until the model emits `final`, hits the step limit (configurable, default 8), or you press Stop.

## 📁 Project structure

```
app/
  layout.js            # root layout + metadata
  page.js              # chat + agent UI (client component)
  globals.css          # theme
  icon.svg             # favicon
  api/
    chat/route.js      # streaming proxy → NVIDIA NIM chat completions
    models/route.js    # model list (live / curated fallback)
    tools/route.js     # agent tools: web_search, open_url, run_javascript
components/
  AgentRun.js          # live agent timeline (steps, tools, files)
  FileViewer.js        # artifact viewer: copy / download / preview HTML
  Markdown.js          # dependency-free markdown renderer
  ModelPicker.js       # the AI model dropdown
  Settings.js          # settings modal (API key, sampling, agent steps)
lib/
  agent.js             # agent prompt, JSON protocol, loop transport
  models.js            # curated model catalogue + helpers
```

## 🛠 Tech stack

- [Next.js](https://nextjs.org) 14 (App Router) — zero config on Vercel
- [React](https://react.dev) 18
- [NVIDIA NIM API](https://docs.api.nvidia.com) — OpenAI-compatible endpoints at `integrate.api.nvidia.com`
- No other runtime dependencies

## 📄 License

See [LICENSE](./LICENSE).
