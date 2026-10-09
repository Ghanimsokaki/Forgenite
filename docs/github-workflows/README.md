# GitHub Actions workflows (copy into `.github/workflows/`)

The automation that opened this PR may not edit workflow files, so the updated workflows live here. To enable them:

```bash
cp docs/github-workflows/ci.yml docs/github-workflows/heartbeat.yml .github/workflows/
git add .github/workflows && git commit -m "ci: unit + e2e tests, automation heartbeat" && git push
```

* **ci.yml** runs `npm ci`, the unit tests, `next build` and the end-to-end tests (against a mock NIM). The old CI only built the app.
* **heartbeat.yml** is optional. Every 10 minutes it calls `/api/cron`, which keeps automations running on serverless or sleeping hosts. It needs the repo secrets `FORGENITE_URL` and `CRON_SECRET`.
