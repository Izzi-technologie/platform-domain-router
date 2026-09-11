import { fileURLToPath } from "node:url";

import { serve } from "@hono/node-server";
import { Hono } from "hono";

import { loadConfig, type AppConfig } from "./config.js";
import { ResolveCache, normalizeHostKey } from "./cache.js";
import { healthPayload, readyPayload } from "./health.js";
import { createMetrics, snapshotMetrics } from "./metrics.js";
import { proxyToUpstream } from "./proxy.js";
import { resolveHostForProxy } from "./resolve.js";

function log(level: string, fields: Record<string, unknown>): void {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level,
      service: "platform-domain-router",
      ...fields,
    }),
  );
}

export function createApp(config: AppConfig) {
  const cache = new ResolveCache(config.cacheTtlMs, config.negativeCacheTtlMs);
  const metrics = createMetrics();

  const app = new Hono();

  app.get("/health", (c) => c.json(healthPayload()));

  app.get("/ready", (c) =>
    c.json(readyPayload(config, snapshotMetrics(metrics.resolve, cache.getStats(), metrics.proxy))),
  );

  app.get("/metrics", (c) =>
    c.json(snapshotMetrics(metrics.resolve, cache.getStats(), metrics.proxy)),
  );

  app.all("*", async (c) => {
    const hostHeader = c.req.header("host");
    const host = normalizeHostKey(hostHeader ?? "");

    if (!host) {
      return c.text("Bad Request", 400);
    }

    metrics.proxy.requests += 1;

    try {
      const winner = await resolveHostForProxy(host, config, cache, metrics.resolve);

      if (!winner) {
        metrics.proxy.notFound += 1;
        log("warn", {
          event: "host_unresolved",
          host,
        });
        return c.text("Not Found", 404);
      }

      log("info", {
        event: "proxy",
        host,
        saasId: winner.saasId,
        upstream: winner.upstreamUrl,
      });

      return proxyToUpstream(c, winner, config.proxyTimeoutMs);
    } catch (err) {
      metrics.proxy.proxyErrors += 1;
      log("error", {
        event: "proxy_error",
        host,
        error: err instanceof Error ? err.message : String(err),
      });
      return c.text("Bad Gateway", 502);
    }
  });

  return app;
}

function main(): void {
  const config = loadConfig();
  const app = createApp(config);

  serve(
    {
      fetch: app.fetch,
      port: config.port,
    },
    (info) => {
      log("info", {
        event: "listen",
        port: info.port,
        services: config.services.filter((service) => service.enabled).map((service) => service.id),
      });
    },
  );
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main();
}
