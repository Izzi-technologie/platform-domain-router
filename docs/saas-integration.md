# SaaS integration contract

Each SaaS on a shared Coolify VPS participates in custom-domain routing via **platform-domain-router**. Do not implement your own global catch-all.

## Required components

| Component                      | Responsibility                                                        |
| ------------------------------ | --------------------------------------------------------------------- |
| `platform-api` (or equivalent) | `GET /api/v1/public/sites/resolve-host?host=`                         |
| `edge-router`                  | Tenant portal proxy after resolve                                     |
| `white_label_domains` table    | Source of truth for custom hostnames                                  |
| Docker service names           | **Unique** on shared network (`platform-api` vs `saas2-platform-api`) |

## `resolve-host` contract

```
GET /api/v1/public/sites/resolve-host?host=<hostname>
```

| Status  | Meaning                                                               |
| ------- | --------------------------------------------------------------------- |
| **200** | SaaS owns this ACTIVE hostname — body includes tenant/portal/upstream |
| **404** | Not owned or not ACTIVE — try next SaaS in federation                 |

Only **ACTIVE** domains resolve. VERIFIED-but-not-active must return 404.

## `SAAS_SERVICES` entry

```json
{
  "id": "your-saas",
  "resolveUrl": "http://your-platform-api:4215/api/v1/public/sites/resolve-host",
  "upstreamUrl": "http://your-edge-router:4270",
  "priority": 10,
  "enabled": true
}
```

- `resolveUrl` / `upstreamUrl`: **http** internal Docker URLs only.
- `priority`: higher wins when multiple SaaS return 200 (ops should avoid duplicate hostnames).
- `enabled`: set `false` to drain a SaaS without removing config.

## What NOT to deploy

- **No** `edge-custom-*` Traefik labels on your commercial compose.
- **No** duplicate catch-all on Coolify Domains UI.
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
