# Coolify deployment

Deploy **one** `platform-domain-router` instance per Coolify server (or per shared Docker network). It replaces per-SaaS `edge-custom-*` Traefik routers.

## Resource setup

| Field         | Value                                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Name          | `platform-domain-router`                                                                                                 |
| Source        | GitHub repo `platform-domain-router`                                                                                     |
| Compose file  | `docker-compose.coolify.yml`                                                                                             |
| Domains UI    | **Empty** (labels only)                                                                                                  |
| Ports Exposes | `4280` (compose `expose`, never host `ports:`)                                                                           |
| Advanced      | Enable **Connect To Predefined Network** so this stack can reach other Coolify resources (`platform-api`, `edge-router`) |

## Environment variables

Production example (IZZIPAY only):

```bash
SAAS_SERVICES=[{"id":"izzipay","resolveUrl":"http://platform-api:4215/api/v1/public/sites/resolve-host","upstreamUrl":"http://edge-router:4270","priority":10,"enabled":true}]
```

Coolify clones the repo and builds `Dockerfile` — no GHCR pull.

## Deployment order

1. Deploy `platform-domain-router` with **Connect To Predefined Network** (catch-all active).
2. Remove `edge-custom-*` labels from each SaaS commercial compose (IZZIPAY: `docker/web/docker-compose.coolify.commercial.yml`) and redeploy commercial.
3. Smoke-test custom + managed domains (see IZZIPAY `scripts/deploy/smoke-platform-domain-router.sh`).
4. Add additional SaaS entries to `SAAS_SERVICES` when a second product joins the VPS.

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

A second SaaS only needs its own Traefik routers at priority **> 1** (managed 10 / ops 20) and an entry in `SAAS_SERVICES`.

## Troubleshooting

| Symptom                                | Check                                                                                                    |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Custom domain 502                      | `platform-domain-router` health, predefined network, `upstreamUrl` reachable                             |
| Custom domain 404                      | `resolve-host` on each SaaS API; domain ACTIVE in DB                                                     |
| Managed slug hits PDR                  | Missing `edge-managed-*` priority 10 on SaaS edge-router                                                 |
| TLS OK but wrong app                   | Two catch-alls — remove `edge-custom-*` from SaaS composes                                               |
| Intermittent 504 / No Available Server | Host `ports:` mapping, or a custom `networks:` block — Coolify Traefik must stay on the resource network |

## Related

- [traefik-labels.example.yml](./traefik-labels.example.yml)
- [saas-integration.md](./saas-integration.md)
