/* Secure JavaScript execution for the agent's run_javascript tool.
 *
 * Uses QuickJS compiled to WebAssembly (quickjs-emscripten). Code runs in a
 * completely separate JS engine — no access to Node's process, require, fs,
 * network, or the host's globals — with a wall-clock deadline (interrupt
 * handler, also covers promise jobs) and a memory cap.
 */
import { getQuickJS, shouldInterruptAfterDeadline } from "quickjs-emscripten";

let qjsPromise = null;
const getQ = () => (qjsPromise ||= getQuickJS());

const MAX_OUT = 8000;

export async function runJavascript(code, { timeoutMs = 3000, memoryBytes = 64 * 1024 * 1024 } = {}) {
  const QuickJS = await getQ();
  const runtime = QuickJS.newRuntime();
  runtime.setMemoryLimit(memoryBytes);
  runtime.setMaxStackSize(1024 * 1024);
  const deadline = Date.now() + timeoutMs;
  runtime.setInterruptHandler(shouldInterruptAfterDeadline(deadline));
  const vm = runtime.newContext();
  const logs = [];
  let outLen = 0;

  const fmt = (h) => {
    const t = vm.typeof(h);
    if (t === "string") return vm.getString(h);
    try {
      const j = vm.dump(h);
      return typeof j === "string" ? j : JSON.stringify(j, null, 0) ?? String(j);
    } catch {
      return "[unserializable]";
    }
  };

  try {
    const consoleObj = vm.newObject();
    for (const level of ["log", "info", "warn", "error", "debug"]) {
      const fn = vm.newFunction(level, (...args) => {
        if (outLen > MAX_OUT) return;
        const line = (level === "error" ? "ERROR " : "") + args.map(fmt).join(" ");
        outLen += line.length;
        logs.push(line);
      });
      vm.setProp(consoleObj, level, fn);
      fn.dispose();
    }
    vm.setProp(vm.global, "console", consoleObj);
    consoleObj.dispose();

    const res = vm.evalCode(String(code), "agent.js");
    let resultText;
    if (res.error) {
      const err = vm.dump(res.error);
      res.error.dispose();
      const msg =
        err && typeof err === "object"
          ? `${err.name || "Error"}: ${err.message || JSON.stringify(err)}`
          : String(err);
      const timedOut = Date.now() >= deadline || /interrupted/i.test(msg);
      return `Code threw: ${timedOut ? `timed out after ${timeoutMs}ms` : msg}\n\nConsole output:\n${
        logs.join("\n").slice(0, 4000) || "(empty)"
      }`;
    }
    // Run pending promise jobs (bounded by the same interrupt deadline).
    try {
      runtime.executePendingJobs(-1);
    } catch {
      /* ignore */
    }
    const t = vm.typeof(res.value);
    if (t !== "undefined") resultText = fmt(res.value);
    res.value.dispose();

    let out = logs.join("\n");
    if (out.length > MAX_OUT) out = out.slice(0, MAX_OUT) + "\n… (output truncated)";
    if (resultText !== undefined) out += (out ? "\n" : "") + "=> " + resultText;
    return out || "(no output — use console.log() or end with an expression value)";
  } finally {
    vm.dispose();
    runtime.dispose();
  }
}
