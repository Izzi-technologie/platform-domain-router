# Coolify deployment

Deploy **one** `platform-domain-router` instance per Coolify server (or per shared Docker network). It replaces per-SaaS `edge-custom-*` Traefik routers.

## Resource setup

| Field                                | Value                                                                                                                              |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Name                                 | `platform-domain-router`                                                                                                           |
| Source                               | GitHub repo `platform-domain-router`                                                                                               |
| Compose file                         | `docker-compose.coolify.yml`                                                                                                       |
| Domains UI                           | **Empty** for `platform-domain-router` (labels only — never add a domain here, never enable the Coolify catch-all checkbox)        |
| Escape special characters in labels? | **OFF** (Traefik 3 `HostRegexp` backticks must stay unescaped)                                                                     |
| Ports Exposes                        | `4280` (compose `expose`, never host `ports:`)                                                                                     |
| Advanced                             | Enable **Connect To Predefined Network** so this stack can reach SaaS resources (`platform-api`, `edge-router`, `school360-api`, `school360-dashboard`) |

## Environment variables

Production example (IZZIPAY + School360 on the same VPS):

```bash
SAAS_SERVICES=[{"id":"izzipay","resolveUrl":"http://platform-api:4215/api/v1/public/sites/resolve-host","upstreamUrl":"http://edge-router:4270","priority":10,"enabled":true},{"id":"school360","resolveUrl":"http://school360-api:3001/api/v1/public/resolve-host","upstreamUrl":"http://school360-dashboard:3000","priority":10,"enabled":true}]
```

Coolify clones the repo and builds `Dockerfile` — no GHCR pull.

## Deployment order

1. Deploy `platform-domain-router` with **Connect To Predefined Network**, **Escape labels OFF**, and Domains UI empty (catch-all labels in compose are already active).
2. Remove `edge-custom-*` labels from each SaaS commercial compose (IZZIPAY: `docker/web/docker-compose.coolify.commercial.yml`) and redeploy commercial. School360 must not add a dashboard catch-all — tenant `HostRegexp` stays at priority 10.
3. Smoke-test custom + managed domains (see IZZIPAY `scripts/deploy/smoke-platform-domain-router.sh`).
4. Keep `SAAS_SERVICES` in sync when a SaaS joins or leaves the VPS.

## Traefik label verification

After deploy, confirm the catch-all rule and priority:

```bash
docker ps --filter name=platform-domain-router --format '{{.Names}}' | head -1 | xargs -I{} \
  docker inspect {} --format '{{json .Config.Labels}}' | jq -r 'to_entries[] | select(.key | contains("pdr-custom"))'
```

Expected:

```
traefik.http.routers.pdr-custom-https.rule=HostRegexp(`^.+$`)
traefik.http.routers.pdr-custom-https.priority=1
```

**Broken (Escape labels ON):** the rule still contains escaped backticks or a literal `${…}` — toggle OFF and redeploy.

A second SaaS only needs its own Traefik routers at priority **> 1** (managed 10 / ops 20) and an entry in `SAAS_SERVICES`.

## Host header (Traefik → PDR → edge-router)

Coolify/Traefik may rewrite `Host` to the container name (`platform-domain-router`, `edge-router`). PDR handles this in two layers:

1. **Traefik labels** — `passhostheader=true` on `pdr-svc` (see `docker-compose.coolify.yml`).
2. **PDR runtime** — prefers `X-Forwarded-Host` when `Host` is an internal Docker name; forwards the tenant `Host` to `upstreamUrl` via `node:http` (not `fetch`, which would send the Docker service name).

**Do not** add Domains on the SaaS `edge-router` service for custom domains — only PDR is the global catch-all. Managed zones (`{slug}.izzisite.com`) keep their own Traefik labels at priority **10** on edge-router.

Verify after deploy:

```bash
# Traefik → PDR preserves forwarded host
curl -sI -H "Host: tenant.example.com" https://<any-custom-domain>/health

# PDR logs should show host=tenant.example.com, not platform-domain-router
docker logs <platform-domain-router-container> 2>&1 | tail
```

## Troubleshooting

| Symptom                                             | Check                                                                                                                  |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Log `host_unresolved` host=`edge-router`            | PDR redeployed with Host fix; edge-router Domains UI empty; custom domain hits PDR catch-all, not edge-router directly |
| Log `host_unresolved` host=`platform-domain-router` | Same — verify `passhostheader=true` label on running container; Domains UI empty on PDR                                |
| Custom domain 502                                   | `platform-domain-router` health, predefined network, `upstreamUrl` reachable                                           |
| Custom domain 404                                   | `resolve-host` on each SaaS API; domain ACTIVE in DB                                                                   |
| Managed slug hits PDR                               | Missing `edge-managed-*` priority 10 on SaaS edge-router                                                               |
| TLS OK but wrong app                                | Two catch-alls — remove `edge-custom-*` from SaaS composes                                                             |
| Catch-all 503 / rule not interpolating              | Escape labels still ON — toggle OFF and redeploy                                                                       |
| Intermittent 504 / No Available Server              | Host `ports:` mapping, or a custom `networks:` block — Coolify Traefik must stay on the resource network               |

## Related

- [traefik-labels.example.yml](./traefik-labels.example.yml)
- [saas-integration.md](./saas-integration.md)
