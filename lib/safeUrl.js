/** Returns the URL if it is safe to use as a link href, else null. */
export function safeHref(url) {
  const s = String(url || "").trim();
  if (!s) return null;
  if (/^(https?:|mailto:)/i.test(s)) return s;
  if (/^(#|\/(?!\/))/.test(s)) return s; // in-page anchors and same-site paths
  return null;
}
