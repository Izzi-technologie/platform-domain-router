import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ResolveCache } from "../src/cache.js";
import { buildUpstreamAllowlist, loadConfig, type SaasService } from "../src/config.js";
import {
  pickWinner,
  probeAllServices,
  resolveHostForProxy,
  type ResolveProbeResult,
} from "../src/resolve.js";

const services: SaasService[] = [
  {
    id: "izzipay",
    resolveUrl: "http://platform-api:4215/api/v1/public/sites/resolve-host",
    upstreamUrl: "http://edge-router:4270",
    priority: 10,
    enabled: true,
  },
  {
    id: "saas2",
    resolveUrl: "http://saas2-platform-api:4215/api/v1/public/sites/resolve-host",
    upstreamUrl: "http://saas2-edge-router:4280",
    priority: 20,
    enabled: true,
  },
];

describe("pickWinner", () => {
  it("chooses highest-priority 200 response", () => {
    const probes: ResolveProbeResult[] = [
      {
        service: services[0]!,
        status: 200,
        latencyMs: 10,
      },
      {
        service: services[1]!,
        status: 404,
        latencyMs: 8,
      },
    ];

    const allowlist = buildUpstreamAllowlist(services, undefined);
    const winner = pickWinner(probes, allowlist);

    assert.deepEqual(winner, {
      saasId: "izzipay",
      upstreamUrl: "http://edge-router:4270",
    });
  });

  it("prefers higher priority when both return 200", () => {
    const probes: ResolveProbeResult[] = [
      {
        service: services[0]!,
        status: 200,
        latencyMs: 10,
      },
      {
        service: services[1]!,
        status: 200,
        latencyMs: 8,
      },
    ];

    const allowlist = buildUpstreamAllowlist(services, undefined);
    const winner = pickWinner(probes, allowlist);

    assert.deepEqual(winner, {
      saasId: "saas2",
      upstreamUrl: "http://saas2-edge-router:4280",
    });
  });

  it("returns null when all probes are 404", () => {
    const probes: ResolveProbeResult[] = services.map((service) => ({
      service,
      status: 404,
      latencyMs: 5,
    }));

    const allowlist = buildUpstreamAllowlist(services, undefined);
    assert.equal(pickWinner(probes, allowlist), null);
  });
});

describe("resolveHostForProxy federation", () => {
  it("falls through to second SaaS when first returns 404", async () => {
    const config = loadConfig({
      SAAS_SERVICES: JSON.stringify(services),
    });
    const cache = new ResolveCache(60_000, 30_000);
    const metrics = {
      probes: 0,
      wins: 0,
      notFound: 0,
      errors: 0,
      cached: 0,
    };

    const fetchImpl = async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      if (url.includes("saas2-platform-api")) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (url.includes("//platform-api:")) {
        return new Response(null, { status: 404 });
      }
      return new Response(null, { status: 502 });
    };

    const winner = await resolveHostForProxy("tenant.saas2.com", config, cache, metrics, {
      fetchImpl,
    });

    assert.deepEqual(winner, {
      saasId: "saas2",
      upstreamUrl: "http://saas2-edge-router:4280",
    });
    assert.equal(metrics.probes, 2);
  });

  it("uses cache on second request", async () => {
    const config = loadConfig({
      SAAS_SERVICES: JSON.stringify(services),
    });
    const cache = new ResolveCache(60_000, 30_000);
    const metrics = {
      probes: 0,
      wins: 0,
      notFound: 0,
      errors: 0,
      cached: 0,
    };

    let calls = 0;
    const fetchImpl = async (): Promise<Response> => {
      calls += 1;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    await resolveHostForProxy("cached.test", config, cache, metrics, {
      fetchImpl,
    });
    await resolveHostForProxy("cached.test", config, cache, metrics, {
      fetchImpl,
    });

    assert.equal(calls, 2);
    assert.equal(metrics.cached, 1);
  });
});

describe("probeAllServices", () => {
  it("probes all enabled services in parallel", async () => {
    const started: string[] = [];
    const fetchImpl = async (input: RequestInfo | URL): Promise<Response> => {
      started.push(String(input));
      return new Response(null, { status: 404 });
    };

    const probes = await probeAllServices(services, "host.test", 1000, fetchImpl);
    assert.equal(probes.length, 2);
    assert.equal(started.length, 2);
  });
});
