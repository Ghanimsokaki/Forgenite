/* SSRF-hardened fetch for server-side tools.
 *
 * - only http(s)
 * - resolves the hostname and refuses private / loopback / link-local /
 *   metadata / multicast addresses (IPv4 + IPv6, incl. IPv4-mapped IPv6)
 * - follows redirects MANUALLY (max 5) and re-validates every hop
 * - hard timeout + response size cap
 */
import dns from "node:dns/promises";
import net from "node:net";

export const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 Forgenite/3.0";

function ipv4ToInt(ip) {
  return ip.split(".").reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;
}

const V4_BLOCKS = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
].map(([base, bits]) => [ipv4ToInt(base), bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0]);

export function isPrivateIp(ip) {
  const kind = net.isIP(ip);
  if (kind === 4) {
    const n = ipv4ToInt(ip);
    return V4_BLOCKS.some(([base, mask]) => (n & mask) === (base & mask));
  }
  if (kind === 6) {
    const s = ip.toLowerCase().replace(/^\[|\]$/g, "");
    if (s === "::" || s === "::1") return true;
    const mapped = /^(?:0*:)*:?ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s) || /^::(\d+\.\d+\.\d+\.\d+)$/.exec(s);
    if (mapped) return isPrivateIp(mapped[1]);
    const hexMapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(s);
    if (hexMapped) {
      const hi = parseInt(hexMapped[1], 16);
      const lo = parseInt(hexMapped[2], 16);
      return isPrivateIp(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    const first = parseInt(s.split(":")[0] || "0", 16);
    if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
    if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link local
    if ((first & 0xff00) === 0xff00) return true; // ff00::/8 multicast
    if (s.startsWith("64:ff9b:")) return true; // NAT64 can reach v4 internals
    return false;
  }
  return true; // not an IP at all → treat as unsafe
}

export async function assertPublicUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("invalid URL.");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("only http(s) URLs are allowed.");
  if (u.username || u.password) throw new Error("URLs with credentials are not allowed.");
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("this host is not allowed.");
  }
  if (process.env.FORGENITE_ALLOW_PRIVATE_FETCH === "1") return u; // tests / self-hosted intranet use
  let addrs;
  if (net.isIP(host)) addrs = [{ address: host }];
  else {
    try {
      addrs = await dns.lookup(host, { all: true, verbatim: true });
    } catch {
      throw new Error(`could not resolve host "${host}".`);
    }
  }
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) {
    throw new Error("this host resolves to a private or reserved address and is not allowed.");
  }
  return u;
}

/**
 * fetch() with SSRF protection. Returns { status, headers, url, text }.
 */
export async function safeFetch(url, { method = "GET", headers = {}, body, timeoutMs = 12000, maxBytes = 500_000, maxRedirects = 5 } = {}) {
  let current = await assertPublicUrl(url);
  const signal = AbortSignal.timeout(timeoutMs);
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const r = await fetch(current, {
      method,
      headers: { "User-Agent": UA, ...headers },
      body,
      redirect: "manual",
      signal,
      cache: "no-store",
    });
    if (r.status >= 300 && r.status < 400 && r.headers.get("location")) {
      if (hop === maxRedirects) throw new Error("too many redirects.");
      const next = new URL(r.headers.get("location"), current).href;
      current = await assertPublicUrl(next);
      if (r.status !== 307 && r.status !== 308) {
        method = "GET";
        body = undefined;
      }
      continue;
    }
    // Read with a byte cap.
    let text = "";
    if (r.body) {
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        text += dec.decode(value, { stream: true });
        if (size >= maxBytes) {
          reader.cancel().catch(() => {});
          break;
        }
      }
    }
    return { status: r.status, ok: r.ok, headers: r.headers, url: current.href, text };
  }
  throw new Error("too many redirects.");
}
