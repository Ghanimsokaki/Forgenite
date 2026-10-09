/* Optional owner password (FORGENITE_PASSWORD). When set, the whole app
 * (except published sites under /s/ and the login endpoints) requires a
 * signed session cookie. Implemented with Web Crypto so it works in both the
 * Edge middleware and Node routes. */
export const SESSION_COOKIE = "fg_session";

export function passwordEnabled() {
  return !!(process.env.FORGENITE_PASSWORD || "").trim();
}

async function hmac(message) {
  const secret = (process.env.FORGENITE_SESSION_SECRET || "") + "|" + (process.env.FORGENITE_PASSWORD || "");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function makeSessionToken(days = 30) {
  const exp = Date.now() + days * 86400_000;
  return `${exp}.${await hmac(`session:${exp}`)}`;
}

export async function verifySessionToken(token) {
  if (!token || typeof token !== "string") return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const expect = await hmac(`session:${exp}`);
  if (expect.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expect.charCodeAt(i);
  return diff === 0;
}

export function checkPassword(pw) {
  const real = (process.env.FORGENITE_PASSWORD || "").trim();
  const given = String(pw || "");
  if (!real || given.length !== real.length) return false;
  let diff = 0;
  for (let i = 0; i < real.length; i++) diff |= real.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}
