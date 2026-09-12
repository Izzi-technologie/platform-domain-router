import { request as httpRequest } from "node:http";
import { Readable } from "node:stream";

import type { Context } from "hono";

import type { ResolveWinner } from "./cache.js";
import { resolveRequestHost } from "./host.js";

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

export function forwardHeaders(
  c: Context,
  winner: ResolveWinner,
  clientHost: string,
): Record<string, string> {
  const headers: Record<string, string> = {};

  c.req.raw.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP.has(lower) || lower === "host") return;
    headers[key] = value;
  });

  if (clientHost) {
    // node:http allows Host; fetch forbids it and would send the upstream Docker name.
    headers.host = clientHost;
    headers["x-forwarded-host"] = clientHost;
  }

  headers["x-forwarded-proto"] = "https";
  headers["x-saas-id"] = winner.saasId;

  return headers;
}

export async function proxyToUpstream(
  c: Context,
  winner: ResolveWinner,
  timeoutMs: number,
): Promise<Response> {
  const clientHost = resolveRequestHost(c.req.raw.headers);
  const target = new URL(buildUpstreamTarget(winner.upstreamUrl, c.req.url));
  const headers = forwardHeaders(c, winner, clientHost);
  const method = c.req.method;
  const hasBody = method !== "GET" && method !== "HEAD";

  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: target.hostname,
        port: target.port || 80,
        path: `${target.pathname}${target.search}`,
        method,
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      },
      (res) => {
        const responseHeaders = new Headers();
        for (const [key, value] of Object.entries(res.headers)) {
          if (value === undefined) continue;
          responseHeaders.append(key, Array.isArray(value) ? value.join(", ") : value);
        }

        resolve(
          new Response(Readable.toWeb(res) as ReadableStream, {
            status: res.statusCode ?? 502,
            headers: responseHeaders,
          }),
        );
      },
    );

    req.on("error", reject);

    if (hasBody && c.req.raw.body) {
      Readable.fromWeb(c.req.raw.body as import("stream/web").ReadableStream).pipe(req);
      return;
    }

    req.end();
  });
}
