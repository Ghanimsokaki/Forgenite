/* Forgenite File Utilities — enhanced downloads, MIME detection, ZIP bundles */

const MIME_MAP = {
  html: "text/html",
  htm: "text/html",
  css: "text/css",
  js: "text/javascript",
  mjs: "text/javascript",
  json: "application/json",
  xml: "application/xml",
  txt: "text/plain",
  md: "text/markdown",
  py: "text/x-python",
  rb: "text/x-ruby",
  php: "text/x-php",
  java: "text/x-java",
  c: "text/x-c",
  cpp: "text/x-c++",
  h: "text/x-c",
  rs: "text/x-rust",
  go: "text/x-go",
  sh: "application/x-sh",
  yaml: "text/x-yaml",
  yml: "text/x-yaml",
  toml: "text/x-toml",
  sql: "application/sql",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  ico: "image/x-icon",
  pdf: "application/pdf",
  zip: "application/zip",
  tar: "application/x-tar",
  gz: "application/gzip",
  wasm: "application/wasm",
};

/**
 * Detect MIME type from file path extension.
 */
export function mimeFromPath(path) {
  const ext = String(path || "")
    .split("/")
    .pop()
    .split(".")
    .pop()
    .toLowerCase();
  return MIME_MAP[ext] || "text/plain";
}

/**
 * Download a single file as a blob with correct MIME type.
 */
export function downloadFile(path, content) {
  const mime = mimeFromPath(path);
  const blob = new Blob([content], { type: mime + ";charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = path.split("/").pop() || "file.txt";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

/**
 * Create a ZIP archive from multiple files (requires JSZip in browser).
 * @param {{ path: string, content: string }[]} files
 * @param {string} zipName
 */
export async function downloadAsZip(files, zipName = "project.zip") {
  if (typeof window === "undefined") {
    throw new Error("ZIP download only works in the browser.");
  }

  // Dynamically import JSZip (only when needed)
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  for (const file of files) {
    zip.file(file.path, file.content);
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = zipName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

/**
 * Copy text to clipboard (fallback-safe).
 */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Generate a safe filename from user input.
 */
export function sanitizePath(p) {
  let s = String(p || "")
    .trim()
    .replace(/\\/g, "/");
  s = s.replace(/^\/+/, "");
  const parts = s.split("/").filter((seg) => seg && seg !== "." && seg !== "..");
  s = parts.join("/");
  if (!s) s = "file.txt";
  if (s.length > 150) s = s.slice(-150);
  return s;
}
