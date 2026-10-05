import type { IncomingHttpHeaders } from "node:http";

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Client IP used as the rate-limit key (REST login / exists, `player:join`).
 *
 * Order: `CF-Connecting-IP` (set – and overwritten – by Cloudflare), then
 * the right-most `X-Forwarded-For` entry (the one appended by the nearest
 * proxy; Cloudflare appends to a client-supplied XFF instead of replacing
 * it, so the left-most entry is attacker-controlled), then the socket
 * address.
 */
export function clientIp(headers: IncomingHttpHeaders, socketAddress: string | undefined): string {
  const cf = firstHeader(headers["cf-connecting-ip"])?.trim();
  if (cf) return cf;
  const xff = headers["x-forwarded-for"];
  const entries = (Array.isArray(xff) ? xff.join(",") : (xff ?? ""))
    .split(",")
    .map((e) => e.trim())
    .filter((e) => e !== "");
  const last = entries.at(-1);
  if (last) return last;
  return socketAddress ?? "unknown";
}
