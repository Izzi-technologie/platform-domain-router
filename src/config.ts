export type SaasService = {
  id: string;
  resolveUrl: string;
  upstreamUrl: string;
  priority: number;
  enabled: boolean;
};

export type AppConfig = {
  port: number;
  services: SaasService[];
  upstreamHostAllowlist: Set<string>;
  cacheTtlMs: number;
  negativeCacheTtlMs: number;
  resolveTimeoutMs: number;
  proxyTimeoutMs: number;
};

const INTERNAL_PROTOCOLS = new Set(["http:"]);

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseUrlField(raw: unknown, field: string, serviceId: string): URL {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new Error(`SAAS_SERVICES[${serviceId}].${field} must be a non-empty string`);
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`SAAS_SERVICES[${serviceId}].${field} is not a valid URL: ${raw}`);
  }

  if (!INTERNAL_PROTOCOLS.has(url.protocol)) {
    throw new Error(`SAAS_SERVICES[${serviceId}].${field} must use http (internal Docker): ${raw}`);
  }

  if (!url.hostname) {
    throw new Error(`SAAS_SERVICES[${serviceId}].${field} must include a hostname: ${raw}`);
  }

  return url;
}

function serializeInternalUrl(url: URL): string {
  if (url.pathname === "/" && !url.search) {
    return url.origin;
  }
  return `${url.origin}${url.pathname}${url.search}`;
}

function parseService(raw: unknown, index: number): SaasService {
  if (!raw || typeof raw !== "object") {
    throw new Error(`SAAS_SERVICES[${index}] must be an object`);
  }

  const entry = raw as Record<string, unknown>;
  const id = entry.id;
  if (typeof id !== "string" || id.trim() === "") {
    throw new Error(`SAAS_SERVICES[${index}].id must be a non-empty string`);
  }

  const resolveUrl = serializeInternalUrl(parseUrlField(entry.resolveUrl, "resolveUrl", id));
  const upstreamUrl = serializeInternalUrl(parseUrlField(entry.upstreamUrl, "upstreamUrl", id));

  const priority =
    typeof entry.priority === "number" && Number.isFinite(entry.priority) ? entry.priority : 0;

  const enabled = entry.enabled !== false;

  return { id, resolveUrl, upstreamUrl, priority, enabled };
}

export function parseSaasServices(raw: string): SaasService[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `SAAS_SERVICES must be valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("SAAS_SERVICES must be a non-empty JSON array");
  }

  const services = parsed.map(parseService);
  const ids = new Set<string>();
  for (const service of services) {
    if (ids.has(service.id)) {
      throw new Error(`Duplicate SAAS_SERVICES id: ${service.id}`);
    }
    ids.add(service.id);
  }

  return services;
}

function parseExtraAllowlist(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function buildUpstreamAllowlist(
  services: SaasService[],
  extraHostsRaw: string | undefined,
): Set<string> {
  const hosts = new Set<string>();
  for (const service of services) {
    hosts.add(new URL(service.upstreamUrl).hostname.toLowerCase());
  }
  for (const host of parseExtraAllowlist(extraHostsRaw)) {
    hosts.add(host);
  }
  return hosts;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const saasServicesRaw = env.SAAS_SERVICES;
  if (!saasServicesRaw?.trim()) {
    throw new Error("SAAS_SERVICES is required");
  }

  const services = parseSaasServices(saasServicesRaw);
  const enabledCount = services.filter((service) => service.enabled).length;
  if (enabledCount === 0) {
    throw new Error("SAAS_SERVICES must include at least one enabled service");
  }

  return {
    port: parsePositiveInt(env.PORT, 4280),
    services,
    upstreamHostAllowlist: buildUpstreamAllowlist(services, env.UPSTREAM_HOST_ALLOWLIST),
    cacheTtlMs: parsePositiveInt(env.CACHE_TTL_MS, 60_000),
    negativeCacheTtlMs: parsePositiveInt(env.NEGATIVE_CACHE_TTL_MS, 30_000),
    resolveTimeoutMs: parsePositiveInt(env.RESOLVE_TIMEOUT_MS, 2_000),
    proxyTimeoutMs: parsePositiveInt(env.PROXY_TIMEOUT_MS, 30_000),
  };
}

export function isAllowedUpstream(upstreamUrl: string, allowlist: Set<string>): boolean {
  try {
    const url = new URL(upstreamUrl);
    if (!INTERNAL_PROTOCOLS.has(url.protocol)) return false;
    return allowlist.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function enabledServicesSorted(services: SaasService[]): SaasService[] {
  return services.filter((service) => service.enabled).sort((a, b) => b.priority - a.priority);
}
