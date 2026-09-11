# Coolify deployment

Deploy **one** `platform-domain-router` instance per Coolify server (or per shared Docker network). It replaces per-SaaS `edge-custom-*` Traefik routers.

## Resource setup

| Field | Value |
| --- | --- |
| Name | `platform-domain-router` |
| Source | GitHub repo `platform-domain-router` |
| Compose file | `docker-compose.coolify.yml` |
| Domains UI | **Empty** (labels only) |
| Port | `4280` |
| Network | Same network as all SaaS backends + commercial stacks |

## Environment variables

Production example (IZZIPAY only):

```bash
IMAGE_TAG=latest
GITHUB_ORG=wayscompany
PLATFORM_DOMAIN_ROUTER_PORT=4280

TENANT_SITE_BASE_DOMAIN=izzisite.com
TENANT_SITE_BASE_DOMAIN_REGEX=izzisite\.com
PLATFORM_ROOT_DOMAIN=izzi-finance.com
PLATFORM_ROOT_DOMAIN_REGEX=izzi-finance\.com

SAAS_SERVICES=[{"id":"izzipay","resolveUrl":"http://platform-api:4215/api/v1/public/sites/resolve-host","upstreamUrl":"http://edge-router:4270","priority":10,"enabled":true}]
```

Development — override domain vars to `dev.izzisite.com`, `dev.izzi-finance.com`, etc. (same as IZZIPAY commercial stack).

## Deployment order

1. Deploy `platform-domain-router` on the shared network (catch-all active).
2. Remove `edge-custom-*` labels from each SaaS commercial compose (IZZIPAY: `docker/web/docker-compose.coolify.commercial.yml`) and redeploy commercial.
3. Smoke-test custom + managed domains (see IZZIPAY `scripts/deploy/smoke-platform-domain-router.sh`).
4. Add additional SaaS entries to `SAAS_SERVICES` when a second product joins the VPS.

## Traefik label verification

After deploy, confirm labels are interpolated (no literal `${...}`):

```bash
docker ps --filter name=platform-domain-router --format '{{.Names}}' | head -1 | xargs -I{} \
  docker inspect {} --format '{{json .Config.Labels}}' | jq -r 'to_entries[] | select(.key | contains("pdr-custom"))'
```

Expected rule fragment (prod):

```
HostRegexp(`^.+$`) && !HostRegexp(`^.+\.izzisite\.com$`) && !Host(`izzisite.com`) ...
```

## Adding a second SaaS managed zone

When SaaS 2 uses its own managed zone (e.g. `*.saas2.example`), extend the catch-all exclusion rule via env vars in `docker-compose.coolify.yml` or fork the label template — document the regex in your ops runbook.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Custom domain 502 | `platform-domain-router` health, Docker network, `upstreamUrl` reachable |
| Custom domain 404 | `resolve-host` on each SaaS API; domain ACTIVE in DB |
| Managed slug hits PDR | Missing `edge-managed-*` priority 10 on SaaS edge-router |
| TLS OK but wrong app | Two catch-alls — remove `edge-custom-*` from SaaS composes |

## Related

- [traefik-labels.example.yml](./traefik-labels.example.yml)
- [saas-integration.md](./saas-integration.md)
