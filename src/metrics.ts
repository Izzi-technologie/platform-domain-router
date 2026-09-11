import type { CacheStats } from "./cache.js";
import type { ResolveMetrics } from "./resolve.js";

export type ProxyMetrics = {
  requests: number;
  proxyErrors: number;
  notFound: number;
};

export type MetricsSnapshot = {
  resolve: ResolveMetrics;
  cache: CacheStats;
  proxy: ProxyMetrics;
};

export function createMetrics(): {
  resolve: ResolveMetrics;
  proxy: ProxyMetrics;
} {
  return {
    resolve: {
      probes: 0,
      wins: 0,
      notFound: 0,
      errors: 0,
      cached: 0,
    },
    proxy: {
      requests: 0,
      proxyErrors: 0,
      notFound: 0,
    },
  };
}

export function snapshotMetrics(
  resolve: ResolveMetrics,
  cache: CacheStats,
  proxy: ProxyMetrics,
): MetricsSnapshot {
  return {
    resolve: { ...resolve },
    cache: { ...cache },
    proxy: { ...proxy },
  };
}
