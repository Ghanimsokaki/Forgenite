/* End-to-end API test: starts the mock NIM + the built Next.js server and
 * exercises chat streaming, tools, security, sites, automations and cron.
 *   npm run build && npm run test:e2e
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";

const MOCK = 4610;
const APP = 4611;
const BASE = `http://127.0.0.1:${APP}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "forgenite-e2e-"));
const procs = [];
let failures = 0;
let passed = 0;

function start(cmd, args, env) {
  const p = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  p.stdout.on("data", (d) => (log += d));
  p.stderr.on("data", (d) => (log += d));
  p.getLog = () => log;
  procs.push(p);
  return p;
}

async function waitFor(url, ms = 30000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    try {
      const r = await fetch(url);
      if (r.status < 500) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`timeout waiting for ${url}`);
}

async function t(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures++;
    console.log(`  ✗ ${name}\n      ${e.stack?.split("\n").slice(0, 3).join("\n      ")}`);
  }
}

const json = (body) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

try {
  start("node", ["tests/mock-nim.mjs", String(MOCK)]);
  const app = start("node", ["node_modules/next/dist/bin/next", "start", "-p", String(APP)], {
    NVIDIA_API_KEY: "nvapi-test",
    NVIDIA_BASE_URL: `http://127.0.0.1:${MOCK}/v1`,
    FORGENITE_DATA_DIR: dataDir,
    FORGENITE_TICK_SECONDS: "5",
    CRON_SECRET: "s3cret",
    FORGENITE_RATE_LIMIT: "0",
    FORGENITE_TOOL_RATE_LIMIT: "0",
  });
  await waitFor(`http://127.0.0.1:${MOCK}/`);
  await waitFor(`${BASE}/api/health`);
  console.log("servers up — running e2e tests");

  await t("health + scheduler started", async () => {
    const j = await (await fetch(`${BASE}/api/health`)).json();
    assert.equal(j.ok, true);
    assert.equal(j.scheduler.started, true);
  });

  await t("home page renders", async () => {
    const r = await fetch(BASE + "/");
    assert.equal(r.status, 200);
    assert.match(await r.text(), /Forgenite/);
  });

  await t("models: live list from server key, embeddings filtered", async () => {
    const j = await (await fetch(`${BASE}/api/models`)).json();
    assert.equal(j.source, "live");
    assert.equal(j.hasServerKey, true);
    assert.ok(j.models.some((m) => m.id === "mock/echo"));
    assert.ok(!j.models.some((m) => /embed/.test(m.id)));
  });

  await t("chat: streams text with <think> block", async () => {
    const r = await fetch(`${BASE}/api/chat`, json({ model: "mock/echo", messages: [{ role: "user", content: "ping" }] }));
    assert.equal(r.status, 200);
    const text = await r.text();
    assert.match(text, /^<think>\nThinking about it\. \n<\/think>\nEcho: ping$/);
  });

  await t("chat: upstream 404 is mapped with hint", async () => {
    const r = await fetch(`${BASE}/api/chat`, json({ model: "mock/fail-404", messages: [{ role: "user", content: "x" }] }));
    assert.equal(r.status, 404);
    assert.match((await r.json()).error, /not found for account.*not available on your account/i);
  });

  await t("chat: validation errors", async () => {
    assert.equal((await fetch(`${BASE}/api/chat`, json({ messages: [] }))).status, 400);
    assert.equal((await fetch(`${BASE}/api/chat`, json({ model: "m", messages: [{ role: "assistant", content: "a" }] }))).status, 400);
  });

  await t("security: cross-origin API calls are blocked", async () => {
    const r = await fetch(`${BASE}/api/chat`, { ...json({ model: "mock/echo", messages: [{ role: "user", content: "x" }] }), headers: { "Content-Type": "application/json", Origin: "https://evil.example" } });
    assert.equal(r.status, 403);
  });

  await t("security: run_javascript cannot escape the sandbox", async () => {
    const j = await (await fetch(`${BASE}/api/tools`, json({ tool: "run_javascript", input: { code: 'this.constructor.constructor("return typeof process")()' } }))).json();
    assert.equal(j.ok, true);
    assert.match(j.result, /=> undefined/);
  });

  await t("security: infinite loop does not hang the server", async () => {
    const t0 = Date.now();
    const j = await (await fetch(`${BASE}/api/tools`, json({ tool: "run_javascript", input: { code: "while(true){}" } }))).json();
    assert.match(j.result, /timed out/);
    assert.ok(Date.now() - t0 < 8000);
    assert.equal((await fetch(`${BASE}/api/health`)).status, 200);
  });

  await t("security: open_url blocks internal addresses (SSRF)", async () => {
    for (const url of [`http://127.0.0.1:${APP}/api/health`, "http://169.254.169.254/latest/meta-data/", "http://2130706433/", "http://localhost:22/"]) {
      const j = await (await fetch(`${BASE}/api/tools`, json({ tool: "open_url", input: { url } }))).json();
      assert.equal(j.ok, false, url);
      assert.match(j.error, /not allowed|private/i, url);
    }
  });

  let siteId;
  await t("sites: publish + serve with sandbox CSP and <base>", async () => {
    const r = await fetch(`${BASE}/api/sites`, json({ name: "E2E", files: [{ path: "index.html", content: "<html><head><title>x</title></head><body><a href='about.html'>a</a></body></html>" }, { path: "about.html", content: "<p>about</p>" }, { path: "style.css", content: "body{}" }] }));
    assert.equal(r.status, 200);
    siteId = (await r.json()).site.id;
    const page = await fetch(`${BASE}/s/${siteId}/`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get("content-security-policy"), /^sandbox allow-scripts/);
    assert.match(await page.text(), new RegExp(`<base href="/s/${siteId}/">`));
    const css = await fetch(`${BASE}/s/${siteId}/style.css`);
    assert.match(css.headers.get("content-type"), /text\/css/);
    assert.equal((await fetch(`${BASE}/s/${siteId}/nope.png`)).status, 404);
    assert.equal((await fetch(`${BASE}/s/doesnotexist/`)).status, 404);
  });

  await t("sites: path traversal is neutralised", async () => {
    const r = await fetch(`${BASE}/api/sites`, json({ name: "T", files: [{ path: "../../etc/passwd", content: "x" }] }));
    const id = (await r.json()).site.id;
    const s = await (await fetch(`${BASE}/api/sites/${id}`)).json();
    assert.equal(s.site.files[0].path, "etc/passwd");
  });

  let autoId;
  await t("automations: validation", async () => {
    assert.equal((await fetch(`${BASE}/api/automations`, json({ name: "x", task: "" }))).status, 400);
    assert.equal((await fetch(`${BASE}/api/automations`, json({ task: "x", schedule: { type: "interval", minutes: 0 } }))).status, 400);
    assert.equal((await fetch(`${BASE}/api/automations`, json({ task: "x", webhookUrl: "http://insecure" }))).status, 400);
  });

  await t("automations: create, run now (agent mode) → files + final", async () => {
    const r = await fetch(`${BASE}/api/automations`, json({ name: "E2E agent", task: "Build a site", model: "mock/echo", schedule: { type: "manual" }, mode: "agent", maxSteps: 6 }));
    assert.equal(r.status, 201);
    autoId = (await r.json()).automation.id;
    const run = (await (await fetch(`${BASE}/api/automations/${autoId}/run?wait=1`, { method: "POST" })).json()).run;
    assert.equal(run.status, "done", run.error);
    assert.deepEqual(run.files.map((f) => f.path).sort(), ["app.js", "index.html", "style.css"]);
    assert.ok(run.steps.some((s) => s.tool === "run_javascript" && /sum 6/.test(s.observation)));
    assert.match(run.final, /Built the site/);
    const detail = await (await fetch(`${BASE}/api/automations/${autoId}`)).json();
    assert.equal(detail.automation.runCount, 1);
    assert.equal(detail.automation.lastStatus, "done");
    assert.equal(detail.runs.length, 1);
    assert.equal(detail.automation.apiKey, undefined, "secrets must not leak");
  });

  await t("automations: prompt mode", async () => {
    const r = await fetch(`${BASE}/api/automations`, json({ name: "E2E prompt", task: "hello", model: "mock/echo", schedule: { type: "manual" }, mode: "prompt" }));
    const id = (await r.json()).automation.id;
    const run = (await (await fetch(`${BASE}/api/automations/${id}/run?wait=1`, { method: "POST" })).json()).run;
    assert.equal(run.status, "done");
    assert.match(run.final, /^Echo: hello/);
  });

  await t("automations: agent updates a published site and republishes", async () => {
    const r = await fetch(`${BASE}/api/automations`, json({ name: "E2E site", task: "update", model: "mock/echo", schedule: { type: "manual" }, siteId, maxSteps: 6 }));
    const id = (await r.json()).automation.id;
    const run = (await (await fetch(`${BASE}/api/automations/${id}/run?wait=1`, { method: "POST" })).json()).run;
    assert.equal(run.status, "done", run.error);
    assert.equal(run.published, siteId);
    const html = await (await fetch(`${BASE}/s/${siteId}/`)).text();
    assert.ok(html.includes("<base href") && html.length > 20);
  });

  await t("automations: 24/7 scheduler fires interval jobs by itself", async () => {
    const r = await fetch(`${BASE}/api/automations`, json({ name: "E2E interval", task: "tick", model: "mock/echo", mode: "prompt", schedule: { type: "interval", minutes: 1 } }));
    const id = (await r.json()).automation.id;
    // Fast-forward: make it due now by PATCHing nextRunAt through a schedule change + manual store edit is not exposed,
    // so instead trigger the external cron heartbeat after forcing due via the data file.
    const file = path.join(dataDir, "automations.json");
    // wait for file write
    await new Promise((res) => setTimeout(res, 200));
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.ok(data[id]);
    // The in-memory store is authoritative; verify nextRunAt is ~1 minute ahead.
    assert.ok(data[id].nextRunAt > Date.now() && data[id].nextRunAt < Date.now() + 61_000);
    // Wait for the in-process scheduler (ticks every 5s) to run it.
    const deadline = Date.now() + 75_000;
    let detail;
    while (Date.now() < deadline) {
      detail = await (await fetch(`${BASE}/api/automations/${id}`)).json();
      if (detail.runs.length) break;
      await new Promise((res) => setTimeout(res, 2000));
    }
    assert.equal(detail.runs.length >= 1, true, "scheduler did not run the job");
    assert.equal(detail.runs[0].trigger, "schedule");
    assert.equal(detail.runs[0].status, "done");
    assert.ok(detail.automation.nextRunAt > Date.now());
  });

  await t("cron endpoint: auth required, works with secret", async () => {
    assert.equal((await fetch(`${BASE}/api/cron`)).status, 401);
    const j = await (await fetch(`${BASE}/api/cron`, { headers: { Authorization: "Bearer s3cret" } })).json();
    assert.equal(j.ok, true);
  });

  await t("automations: pause / delete", async () => {
    const p = await fetch(`${BASE}/api/automations/${autoId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: false }) });
    assert.equal((await p.json()).automation.enabled, false);
    assert.equal((await fetch(`${BASE}/api/automations/${autoId}`, { method: "DELETE" })).status, 200);
    assert.equal((await fetch(`${BASE}/api/automations/${autoId}`)).status, 404);
  });

  await t("persistence: data survives on disk", async () => {
    const autos = JSON.parse(fs.readFileSync(path.join(dataDir, "automations.json"), "utf8"));
    assert.ok(Object.keys(autos).length >= 3);
    assert.ok(fs.existsSync(path.join(dataDir, "sites.json")));
  });

  if (failures) console.log("\n--- app log (tail) ---\n" + app.getLog().slice(-3000));
} catch (e) {
  failures++;
  console.error("fatal:", e);
  for (const p of procs) console.error(p.getLog().slice(-2000));
} finally {
  for (const p of procs) p.kill("SIGTERM");
  fs.rmSync(dataDir, { recursive: true, force: true });
  console.log(`\n${passed} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}
