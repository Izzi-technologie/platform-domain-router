import type { Context } from "hono";
import { proxy } from "hono/proxy";

import type { ResolveWinner } from "./cache.js";

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
]);

export function buildUpstreamTarget(upstreamBase: string, requestUrl: string): string {
  const incoming = new URL(requestUrl, "http://placeholder.local");
  const base = new URL(upstreamBase);
  const target = new URL(incoming.pathname + incoming.search, base);
  return target.toString();
}

export function forwardHeaders(c: Context, winner: ResolveWinner): Headers {
  const headers = new Headers();
  c.req.raw.headers.forEach((value, key) => {
    if (HOP_BY_HOP.has(key.toLowerCase())) return;
    headers.set(key, value);
  });

  const host = c.req.header("host");
  if (host) {
    headers.set("host", host);
    headers.set("x-forwarded-host", host);
  }

  headers.set("x-forwarded-proto", "https");
  headers.set("x-saas-id", winner.saasId);

  return headers;
}

export async function proxyToUpstream(
  c: Context,
  winner: ResolveWinner,
  timeoutMs: number,
): Promise<Response> {
  const target = buildUpstreamTarget(winner.upstreamUrl, c.req.url);

  return proxy(target, {
    raw: c.req.raw,
    headers: forwardHeaders(c, winner),
    signal: AbortSignal.timeout(timeoutMs),
  });
}
