import test from "node:test";
import assert from "node:assert/strict";
import { extractJson, sanitizePath, runAgentLoop } from "../lib/agentCore.js";
import { nextRun, validateSchedule, describeSchedule, parseCron } from "../lib/schedule.js";
import { isPrivateIp, assertPublicUrl } from "../lib/server/net.js";
import { runJavascript } from "../lib/server/sandbox.js";
import { safeHref } from "../lib/safeUrl.js";

test("extractJson: plain, fenced, think-wrapped, trailing comma, raw newlines", () => {
  assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
  assert.deepEqual(extractJson('sure!\n```json\n{"a":2}\n```'), { a: 2 });
  assert.deepEqual(extractJson('<think>hmm {"x":0}</think>{"a":3}'), { a: 3 });
  assert.deepEqual(extractJson('{"a":[1,2,],}'), { a: [1, 2] });
  assert.deepEqual(extractJson('{"c":"line1\nline2"}'), { c: "line1\nline2" });
  assert.equal(extractJson("no json here"), null);
});

test("sanitizePath blocks traversal", () => {
  assert.equal(sanitizePath("../../etc/passwd"), "etc/passwd");
  assert.equal(sanitizePath("/abs/x.html"), "abs/x.html");
  assert.equal(sanitizePath(""), "file.txt");
  assert.equal(sanitizePath('a\\b<c>.js'), "a/b_c_.js");
});

test("schedule: validation + next run", () => {
  assert.throws(() => validateSchedule({ type: "interval", minutes: 0 }));
  assert.throws(() => validateSchedule({ type: "daily", time: "25:00" }));
  assert.throws(() => parseCron("* * *"));
  const base = Date.UTC(2026, 9, 9, 10, 15); // Fri 2026-10-09 10:15 UTC
  assert.equal(nextRun({ type: "interval", minutes: 30 }, base), base + 30 * 60_000);
  assert.equal(nextRun({ type: "daily", time: "10:30", tzOffsetMinutes: 0 }, base), Date.UTC(2026, 9, 9, 10, 30));
  assert.equal(nextRun({ type: "daily", time: "09:00", tzOffsetMinutes: 0 }, base), Date.UTC(2026, 9, 10, 9, 0));
  // weekly Monday 08:00 UTC → Mon 2026-10-12
  assert.equal(nextRun({ type: "weekly", time: "08:00", days: [1], tzOffsetMinutes: 0 }, base), Date.UTC(2026, 9, 12, 8, 0));
  assert.equal(nextRun({ type: "cron", expr: "*/20 * * * *", tzOffsetMinutes: 0 }, base), Date.UTC(2026, 9, 9, 10, 20));
  // timezone: daily 09:00 at UTC+2 == 07:00 UTC
  assert.equal(nextRun({ type: "daily", time: "09:00", tzOffsetMinutes: 120 }, base), Date.UTC(2026, 9, 10, 7, 0));
  assert.equal(nextRun({ type: "manual" }, base), null);
  assert.equal(describeSchedule({ type: "interval", minutes: 120 }), "Every 2 hours");
  assert.equal(describeSchedule({ type: "weekly", time: "09:00", days: [1, 5] }), "Mon, Fri at 09:00");
});

test("SSRF: private IP detection", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "0.0.0.0", "100.64.1.1", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:7f00:1"])
    assert.equal(isPrivateIp(ip), true, ip);
  for (const ip of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"]) assert.equal(isPrivateIp(ip), false, ip);
});

test("SSRF: URL validation", async () => {
  for (const u of ["http://localhost/", "http://127.0.0.1:3000/", "http://2130706433/", "http://0x7f000001/", "http://[::1]/", "http://169.254.169.254/latest", "file:///etc/passwd", "http://user:pw@example.com/"])
    await assert.rejects(assertPublicUrl(u), undefined, u);
});

test("sandbox: cannot reach host process, timeouts enforced", async () => {
  assert.match(await runJavascript("typeof process + ',' + typeof require"), /undefined,undefined/);
  assert.match(await runJavascript('this.constructor.constructor("return typeof process")()'), /=> undefined/);
  assert.match(await runJavascript("while(true){}", { timeoutMs: 300 }), /timed out|interrupted/i);
  assert.match(await runJavascript("Promise.resolve().then(()=>{while(true){}}); 1", { timeoutMs: 300 }), /=> 1/);
  const out = await runJavascript("console.log('hi', {a:1}); [1,2,3].map(x=>x*2)");
  assert.match(out, /hi \{"a":1\}/);
  assert.match(out, /=> \[2,4,6\]/);
  assert.match(await runJavascript("throw new Error('boom')"), /Error: boom/);
});

test("safeHref blocks javascript: and data: URLs", () => {
  assert.equal(safeHref("javascript:alert(1)"), null);
  assert.equal(safeHref(" JavaScript:alert(1)"), null);
  assert.equal(safeHref("data:text/html,<script>"), null);
  assert.equal(safeHref("https://example.com"), "https://example.com");
  assert.equal(safeHref("mailto:a@b.c"), "mailto:a@b.c");
});

test("agent loop: batch actions, file tools, final", async () => {
  const replies = [
    JSON.stringify({ thought: "w", actions: [{ tool: "write_file", input: { path: "a.txt", content: "hello" } }, { tool: "append_file", input: { path: "a.txt", content: " world" } }] }),
    JSON.stringify({ thought: "r", action: { tool: "read_file", input: { path: "a.txt" } } }),
    JSON.stringify({ thought: "x", action: { tool: "nope", input: {} } }),
    JSON.stringify({ thought: "d", final: "ok" }),
  ];
  const events = [];
  const res = await runAgentLoop({
    task: "t",
    callModel: async () => replies.shift(),
    executeTool: async () => ({ ok: true, result: "" }),
    onEvent: (e) => events.push(e.type),
  });
  assert.equal(res.status, "done");
  assert.equal(res.final, "ok");
  assert.deepEqual(res.files, [{ path: "a.txt", content: "hello world" }]);
  assert.equal(res.steps.length, 4);
  assert.equal(res.steps[2].observation, "hello world");
  assert.equal(res.steps[3].ok, false);
  assert.ok(events.includes("files"));
});

test("agent loop: abort → stopped, bad JSON twice → error", async () => {
  const c = new AbortController();
  c.abort();
  const r1 = await runAgentLoop({ task: "t", signal: c.signal, callModel: async () => "{}", executeTool: async () => ({}) });
  assert.equal(r1.status, "stopped");
  const r2 = await runAgentLoop({ task: "t", callModel: async () => "{not json", executeTool: async () => ({}) });
  assert.equal(r2.status, "error");
});
