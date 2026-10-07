# 🔐 Setting Your Secrets — NVIDIA NIM, GitHub & Vercel

This guide shows you **every secret this project needs, where to put it, and how**.
There are really only two secrets involved:

| Secret | What it is | Where it's used |
| --- | --- | --- |
| `NVIDIA_API_KEY` | Your NVIDIA NIM API key (`nvapi-...`) | Runs the AI models |
| GitHub repo secret `NVIDIA_API_KEY` | The same key, stored encrypted in GitHub | Used by the CI workflow to verify the key |

---

## 1️⃣ Get your NVIDIA NIM API key (free)

1. Go to **[build.nvidia.com](https://build.nvidia.com)** and sign in (create a free account if needed — phone verification is required once).
2. Open **Settings → API Keys** (direct link: <https://build.nvidia.com/settings/api-keys>) — or open any model page and click **Get API Key**.
3. Click **Generate Key** and copy it. It looks like:
   ```
   nvapi-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

**Free tier:** ~40 requests/minute (shared across all models), no credit card needed.

> ⚠️ **Never commit this key into the code or paste it in chat.** If a key ever leaks, delete it on the same settings page and generate a new one.

---

## 2️⃣ Where to put the NVIDIA key

You have **three** options. Pick **A** for your live deployment, **B** for local development, and **C** for a quick test in the browser.

### A. Vercel — for your live website (recommended ✅)

This is the proper way: the key lives on the server, is never visible in the browser, and is used by all visitors.

**Dashboard:**
1. Open your project on [vercel.com](https://vercel.com) → **Settings** → **Environment Variables**.
2. Click **Add**:
   - **Name:** `NVIDIA_API_KEY`
   - **Value:** `nvapi-...` (paste your key)
   - **Environments:** tick ☑ Production ☑ Preview ☑ Development
3. Click **Save**.
4. **Redeploy** so the running app picks it up: **Deployments** tab → latest deployment → **⋯** menu → **Redeploy**.

**Or with the Vercel CLI:**
```bash
npm install -g vercel
vercel login
vercel link              # link this folder to your project
vercel env add NVIDIA_API_KEY
# paste nvapi-... when prompted
vercel deploy --prod
```

### B. Local development

```bash
cp .env.example .env.local
```
Then edit `.env.local`:
```
NVIDIA_API_KEY=nvapi-your-key-here
```
Restart `npm run dev` if it was already running. `.env*` files are in `.gitignore`, so the key can never be pushed to GitHub by accident.

### C. In-app Settings (quick test, no server config)

Click the ⚙️ gear in the top bar → **NVIDIA API key** → paste → **Save**.

- Stored **only in your browser** (localStorage) — nothing is sent anywhere except to your own `/api/chat` route, which forwards it to NVIDIA for that single request.
- Great for trying the app instantly, but each browser/user would need to do this. Use option **A** for a real deployment.

### A.2 Netlify — alternative host

The repo ships with a `netlify.toml` that uses the `@netlify/plugin-nextjs` plugin and pins Node 22, so deploying to Netlify works out of the box.

**Netlify dashboard:**
1. Go to **[app.netlify.com](https://app.netlify.com)** → **Add new site** → **Import an existing project** → pick the GitHub repo.
2. Under **Site settings → Environment variables** (set this *before* the first deploy, or trigger a redeploy after):
   - **Key:** `NVIDIA_API_KEY`
   - **Values:** `nvapi-...`
   - **Scopes:** ☑ All scopes (Build, Deploy, Post processing, Functions, Runtime)
3. Trigger a deploy from the **Deploys** page. The build command (`npm run build`) and publish directory (`.next`) are read automatically from `netlify.toml`.

**Or with the Netlify CLI:**
```bash
npm install -g netlify-cli
netlify login
netlify init                       # link/choose site
netlify env:set NVIDIA_API_KEY "nvapi-..."
netlify deploy --prod
```

### Which one should I use?

| Situation | Use |
| --- | --- |
| Deployed on Vercel | **A** — Vercel env var |
| Deployed on Netlify | **A.2** — Netlify env var |
| Hacking on it locally | **B** — `.env.local` |
| Just want to try it in 10 seconds | **C** — Settings dialog |

---

## 3️⃣ GitHub secrets

**GitHub secrets** are encrypted variables stored in your repository, used by **GitHub Actions** workflows (CI/CD). This repo ships with a workflow — `.github/workflows/ci.yml` — that:

1. Builds the app on every push & pull request (catches broken code), and
2. If a `NVIDIA_API_KEY` secret exists, **verifies the key works** by calling `https://integrate.api.nvidia.com/v1/models` in CI. A green ✅ means your key is valid.

**How to add the secret:**
1. Open your repo on GitHub → **Settings** → left sidebar **Secrets and variables** → **Actions**.
2. Click **New repository secret**.
3. **Name:** `NVIDIA_API_KEY`  **Secret:** `nvapi-...`
4. Click **Add secret**.

That's it. Secrets are encrypted and are never printed in logs (GitHub masks them). The workflow uses it like this:

```yaml
- name: Verify NVIDIA NIM key
  env:
    NVIDIA_API_KEY: ${{ secrets.NVIDIA_API_KEY }}
  run: curl -sS -f -H "Authorization: Bearer $NVIDIA_API_KEY" \
       https://integrate.api.nvidia.com/v1/models -o /dev/null
```

---

## 4️⃣ Connect GitHub ↔ Vercel (put the site on the web)

1. Push this repo to GitHub (already done: [Ghanimsokaki/Forgenite](https://github.com/Ghanimsokaki/Forgenite) — merge the open PR to get it on `main`).
2. Go to **[vercel.com/new](https://vercel.com/new)** and **Import** the `Forgenite` repository.
3. Vercel auto-detects Next.js — leave build settings as-is.
4. Under **Environment Variables**, add `NVIDIA_API_KEY` = `nvapi-...` (same as §2A).
5. Click **Deploy** — your chatbot is live at `https://your-project.vercel.app`.

After that, **every push to `main` (and every merged PR) automatically redeploys the site.** GitHub holds the code, Vercel holds the secret and runs the app.

---

## 5️⃣ Troubleshooting errors

| Error you see | What it means | Fix |
| --- | --- | --- |
| ⚠️ `Could not reach NVIDIA NIM (network error...)` **502** | The server running the app can't reach `integrate.api.nvidia.com` — blocked network, no internet, or you're inside a **sandboxed preview** | Run locally (`npm run dev`) or deploy on Vercel; check firewall/proxy |
| `No NVIDIA API key configured` **401** | Neither `NVIDIA_API_KEY` env var nor a browser key is set | §2 above |
| `Authorization failed` **401/403** | Key invalid, or your account isn't registered for that model family | Re-copy the key; open the model's page on build.nvidia.com and click **"Try API"** once |
| `Not found for account` **404** | That model isn't callable with your key | Pick another model — with a key set, the model picker's **live list** shows exactly what you can call |
| **429** rate limit | Free tier is ~40 requests/min, shared across all models | Wait a minute, then retry |
| **5xx** from NVIDIA | Model overloaded / temporarily down | Retry or switch models |
| Errors only in this chat's live preview | The sandbox preview has **no outbound internet**, so it can never reach NVIDIA | Deploy on Vercel or run locally — the app itself is fine |

---

## 6️⃣ Security rules (quick)

- ✅ Vercel/GitHub env vars and secrets = safe, server-side, encrypted.
- ✅ `.env.local` = safe locally (gitignored).
- ⚠️ In-app Settings key = fine for testing, stored in that one browser.
- ❌ Never hardcode a key in code, README, or commit it.
- 🔄 If a key ever leaks: delete it at build.nvidia.com/settings/api-keys and generate a new one.
