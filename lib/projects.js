/* Web Builder project persistence (browser localStorage). */
const LS = "forgenite.projects.v1";

export function loadProjects() {
  if (typeof window === "undefined") return [];
  try {
    const p = JSON.parse(localStorage.getItem(LS) || "[]");
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

export function saveProjects(projects) {
  try {
    localStorage.setItem(LS, JSON.stringify(projects.slice(0, 40)));
    return true;
  } catch {
    return false;
  }
}

export function newProject(name, files = []) {
  const id = (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36)).slice(0, 12);
  return { id, name: name || "Untitled project", files: files.map((f) => ({ ...f })), createdAt: Date.now(), updatedAt: Date.now(), history: [], siteId: "" };
}

/** Push a snapshot for undo (keeps last 15). */
export function withSnapshot(project, label) {
  const snap = { at: Date.now(), label, files: project.files.map((f) => ({ ...f })) };
  return { ...project, history: [snap, ...(project.history || [])].slice(0, 15) };
}
