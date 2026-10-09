/* Tiny durable JSON store (one file per collection) for automations, runs
 * and published sites. Writes are atomic (tmp file + rename) and serialised
 * per collection. Data dir: FORGENITE_DATA_DIR or ./data. */
import fs from "node:fs/promises";
import path from "node:path";

import os from "node:os";

// Serverless hosts (Vercel/Netlify) have a read-only project dir → fall back to /tmp (ephemeral!).
const SERVERLESS = !!(process.env.VERCEL || process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME);
export let DATA_DIR = path.resolve(
  process.env.FORGENITE_DATA_DIR || (SERVERLESS ? path.join(os.tmpdir(), "forgenite-data") : path.join(process.cwd(), "data"))
);
export const EPHEMERAL = SERVERLESS && !process.env.FORGENITE_DATA_DIR;

const state = globalThis.__forgeniteStore || (globalThis.__forgeniteStore = { cache: new Map(), locks: new Map() });

function file(name) {
  if (!/^[a-z0-9_-]+$/i.test(name)) throw new Error("bad collection name");
  return path.join(DATA_DIR, `${name}.json`);
}

export async function readCollection(name, fallback = {}) {
  if (state.cache.has(name)) return state.cache.get(name);
  let data = fallback;
  try {
    data = JSON.parse(await fs.readFile(file(name), "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") console.error(`[store] could not read ${name}:`, e.message);
  }
  state.cache.set(name, data);
  return data;
}

/** Atomically mutate a collection: fn(data) may mutate in place or return new data. */
export async function updateCollection(name, fn, fallback = {}) {
  const prev = state.locks.get(name) || Promise.resolve();
  let release;
  const lock = new Promise((r) => (release = r));
  state.locks.set(name, prev.then(() => lock));
  await prev;
  try {
    const data = await readCollection(name, fallback);
    const result = (await fn(data)) ?? data;
    state.cache.set(name, result);
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
    } catch (e) {
      if (e.code !== "EROFS" && e.code !== "EACCES") throw e;
      DATA_DIR = path.join(os.tmpdir(), "forgenite-data");
      await fs.mkdir(DATA_DIR, { recursive: true });
      console.warn(`[store] data dir not writable, using ${DATA_DIR} (ephemeral)`);
    }
    const tmp = file(name) + `.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(result));
    await fs.rename(tmp, file(name));
    return result;
  } finally {
    release();
  }
}

export function newId(prefix = "") {
  const r = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36);
  return prefix + r.replace(/-/g, "").slice(0, 16);
}
