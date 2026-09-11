import {
  enabledServicesSorted,
  isAllowedUpstream,
  type AppConfig,
  type SaasService,
} from "./config.js";
import { type ResolveCache, type ResolveWinner } from "./cache.js";

export type ResolveProbeResult = {
  service: SaasService;
  status: number;
  latencyMs: number;
  error?: string;
};

export type ResolveMetrics = {
  probes: number;
  wins: number;
  notFound: number;
  errors: number;
  cached: number;
};

export type ResolveDeps = {
  fetchImpl?: typeof fetch;
  now?: () => number;
};

export async function probeService(
  service: SaasService,
  host: string,
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch,
): Promise<ResolveProbeResult> {
  const started = Date.now();
  const url = `${service.resolveUrl}?host=${encodeURIComponent(host)}`;

  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });

    return {
      service,
      status: response.status,
      latencyMs: Date.now() - started,
    };
  } catch (err) {
    return {
      service,
      status: 0,
      latencyMs: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function probeAllServices(
  services: SaasService[],
  host: string,
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch,
): Promise<ResolveProbeResult[]> {
  const enabled = enabledServicesSorted(services);
  return Promise.all(enabled.map((service) => probeService(service, host, timeoutMs, fetchImpl)));
}

export function pickWinner(
  probes: ResolveProbeResult[],
  allowlist: Set<string>,
): ResolveWinner | null {
  const byPriority = [...probes].sort((a, b) => b.service.priority - a.service.priority);

  for (const probe of byPriority) {
    if (probe.status !== 200) continue;
    if (!isAllowedUpstream(probe.service.upstreamUrl, allowlist)) {
      continue;
    }
    return {
      saasId: probe.service.id,
      upstreamUrl: probe.service.upstreamUrl,
    };
  }

  return null;
}

export async function resolveHostForProxy(
  host: string,
  config: AppConfig,
  cache: ResolveCache,
  metrics: ResolveMetrics,
  deps: ResolveDeps = {},
): Promise<ResolveWinner | null> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const cached = cache.lookup(host);

  if (cached !== undefined) {
    metrics.cached += 1;
    return cached;
  }

  const probes = await probeAllServices(config.services, host, config.resolveTimeoutMs, fetchImpl);

  metrics.probes += probes.length;

  for (const probe of probes) {
    if (probe.status === 200) {
      metrics.wins += 1;
    } else if (probe.status === 404) {
      metrics.notFound += 1;
    } else {
      metrics.errors += 1;
    }
  }

  const winner = pickWinner(probes, config.upstreamHostAllowlist);
  if (winner) {
    cache.setPositive(host, winner);
    return winner;
  }

  cache.setNegative(host);
  return null;
}
