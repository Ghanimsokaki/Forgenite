/* Published sites — Web Builder projects hosted by Forgenite at /s/<id>/.
 * Served with a CSP sandbox so published pages run in an opaque origin and
 * can never touch the app's storage or cookies. */
import { readCollection, updateCollection, newId } from "./store.js";
import { sanitizePath } from "../agentCore.js";

const SITES = "sites";
const MAX_SITE_BYTES = 5 * 1024 * 1024;
const MAX_FILES = 200;

export async function getSite(id) {
  return (await readCollection(SITES))[id] || null;
}

export async function listSites() {
  return Object.values(await readCollection(SITES))
    .map(({ files, ...rest }) => ({ ...rest, fileCount: files.length, bytes: files.reduce((n, f) => n + f.content.length, 0) }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

function cleanFiles(files) {
  const map = new Map();
  for (const f of (files || []).slice(0, MAX_FILES)) {
    if (!f || typeof f.content !== "string") continue;
    map.set(sanitizePath(f.path), f.content);
  }
  const out = [...map.entries()].map(([path, content]) => ({ path, content }));
  const size = out.reduce((n, f) => n + f.content.length, 0);
  if (size > MAX_SITE_BYTES) throw new Error(`site too large (${(size / 1048576).toFixed(1)} MB, max 5 MB)`);
  if (!out.length) throw new Error("no files to publish");
  return out;
}

/** Create (id omitted) or replace a published site's files. */
export async function publishFiles(id, files, { name } = {}) {
  const clean = cleanFiles(files);
  let site;
  await updateCollection(SITES, (d) => {
    const now = Date.now();
    const sid = id && d[id] ? id : id && /^[a-z0-9-]{4,40}$/i.test(id) ? id : newId("").slice(0, 10);
    const prev = d[sid];
    site = {
      id: sid,
      name: String(name || prev?.name || "Untitled site").slice(0, 80),
      createdAt: prev?.createdAt || now,
      updatedAt: now,
      version: (prev?.version || 0) + 1,
      files: clean,
    };
    d[sid] = site;
    if (Object.keys(d).length > 200) throw new Error("site limit reached (200)");
  });
  return site;
}

export async function deleteSite(id) {
  await updateCollection(SITES, (d) => {
    delete d[id];
  });
}
