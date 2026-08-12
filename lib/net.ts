// SSRF protection for the page-review screenshotter. The capture endpoint
// drives a headless browser to a user-supplied URL, so we must ensure the
// hostname doesn't resolve into a private / loopback / link-local / reserved
// range (or the cloud metadata IP) before — and after any redirect — we load it.

import { lookup } from "node:dns/promises";
import net from "node:net";

/** True if an IPv4/IPv6 literal is in a private, loopback, link-local, or reserved range. */
export function isBlockedAddress(ip: string): boolean {
  const type = net.isIP(ip);
  if (type === 4) return isBlockedIPv4(ip);
  if (type === 6) return isBlockedIPv6(ip);
  return true; // not a parseable IP → refuse
}

function isBlockedIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true; // 10.0.0.0/8 private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254 metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isBlockedIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true; // loopback / unspecified
  if (lower.startsWith("fe80")) return true; // link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique-local
  // IPv4-mapped (::ffff:a.b.c.d) — validate the embedded v4.
  const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedIPv4(mapped[1]);
  return false;
}

/**
 * Validate a user URL is safe to fetch: http(s) only, and every address the
 * hostname resolves to is public. Returns the normalized URL string.
 * Throws with a user-safe message otherwise.
 */
export async function assertPublicUrl(raw: string): Promise<string> {
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    throw new Error("That doesn't look like a valid URL.");
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    throw new Error("Only http(s) URLs can be captured.");
  }
  const host = target.hostname.replace(/^\[|\]$/g, "");
  // If the host is itself an IP literal, check it directly.
  if (net.isIP(host)) {
    if (isBlockedAddress(host)) throw new Error("That address is not allowed.");
    return target.toString();
  }
  // Otherwise resolve every A/AAAA record and reject if any is private.
  let addrs: { address: string }[];
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new Error("Could not resolve that hostname.");
  }
  if (!addrs.length) throw new Error("Could not resolve that hostname.");
  for (const a of addrs) {
    if (isBlockedAddress(a.address)) throw new Error("That address is not allowed.");
  }
  return target.toString();
}
