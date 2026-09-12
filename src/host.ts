export function normalizeHostKey(host: string): string {
  return host.trim().toLowerCase().split(":")[0] ?? "";
}

function isPublicHost(host: string): boolean {
  return host.includes(".");
}

/** Docker/Coolify internal names — no public TLD segment. */
function isInternalHost(host: string): boolean {
  if (!host) return true;
  if (!host.includes(".")) return true;
  return host.endsWith(".local") || host.endsWith(".internal");
}

/**
 * Resolve the tenant hostname from incoming proxy headers.
 * Traefik/Coolify may rewrite `Host` to the container name; prefer `X-Forwarded-Host`.
 */
export function resolveRequestHost(headers: Headers): string {
  const host = normalizeHostKey(headers.get("host") ?? "");
  const forwarded = normalizeHostKey(headers.get("x-forwarded-host") ?? "");

  if (forwarded && isInternalHost(host) && isPublicHost(forwarded)) {
    return forwarded;
  }

  return host || forwarded;
}
