# SaaS integration contract

Each SaaS on a shared Coolify VPS participates in custom-domain routing via **platform-domain-router**. Do not implement your own global catch-all.

## Required components

| Component                      | Responsibility                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Platform API (or equivalent)   | `GET resolveUrl?host=` returning **200** (owned + ACTIVE) or **404**                                    |
| Edge / dashboard upstream      | Receives the original `Host` after PDR proxy                                                            |
| Custom-domain table            | Source of truth for custom hostnames                                                                    |
| Docker service names           | **Unique** on shared network (`platform-api` vs `school360-api`, `edge-router` vs `school360-dashboard`) |

## `resolve-host` contract

```
GET <resolveUrl>?host=<hostname>
```

The path is part of `resolveUrl` (IZZIPAY: `/api/v1/public/sites/resolve-host`, School360: `/api/v1/public/resolve-host`). PDR only inspects the HTTP status.

| Status  | Meaning                                                               |
| ------- | --------------------------------------------------------------------- |
| **200** | SaaS owns this ACTIVE hostname — body includes tenant/portal/upstream |
| **404** | Not owned or not ACTIVE — try next SaaS in federation                 |

Only **ACTIVE** domains resolve. VERIFIED-but-not-active must return 404.

## `SAAS_SERVICES` entry

```json
{
  "id": "school360",
  "resolveUrl": "http://school360-api:3001/api/v1/public/resolve-host",
  "upstreamUrl": "http://school360-dashboard:3000",
  "priority": 10,
  "enabled": true
}
```

- `resolveUrl` / `upstreamUrl`: **http** internal Docker URLs only.
- `priority`: higher wins when multiple SaaS return 200 (ops should avoid duplicate hostnames).
- `enabled`: set `false` to drain a SaaS without removing config.

## What NOT to deploy

- **No** `edge-custom-*` Traefik labels or `HostRegexp(\`.+$\`)` on your commercial/dashboard compose.
- **No** duplicate catch-all on Coolify Domains UI (do not check Coolify's catch-all domain box).
- **No** external HTTPS `resolveUrl` (SSRF / latency).

## Headers preserved by platform-domain-router

Proxied requests keep `Host`, `X-Forwarded-*`, method, and body. Added:

- `X-Forwarded-Proto: https`
- `X-Saas-Id: <winning SaaS id>`

Your edge-router continues to resolve tenant context (may double-resolve; edge cache ~60s amortizes).

## Checklist for new SaaS

- [ ] Unique Docker service names on shared network
- [ ] `resolve-host` returns 200/404 per contract
- [ ] edge-router handles managed zone (priority 10) for `{slug}.your-zone`
- [ ] Entry added to platform-domain-router `SAAS_SERVICES`
- [ ] Smoke test custom domain end-to-end

## Reference implementation

IZZIPAY monorepo:

- Resolve: `apps/core/platform-api/src/white-label/public-sites.controller.ts`
- Edge: `apps/core/edge-router`
- Docs: `docs/deployment/CUSTOM_DOMAINS.md`

School360 monorepo:

- Resolve: `GET /api/v1/public/resolve-host` (`packages/school-api/src/routes/public.ts`)
- Upstream: Coolify service `school360-dashboard:3000`
- Docs: `docs/architecture/CUSTOM_DOMAINS.md`
