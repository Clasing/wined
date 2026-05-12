# Wined — Deploy guide

## Topología

```
                        ┌──────────────────────────────┐
                        │  Internet / clients          │
                        └──────────────┬───────────────┘
                                       │ HTTP/HTTPS
                                       ▼
                        ┌──────────────────────────────┐
                        │   Traefik (Dokploy)          │   AWS 15.237.213.46
                        │   - routes by Host header    │
                        │   - terminates TLS (cuando   │
                        │     pongamos certificados)   │
                        └──────────────┬───────────────┘
                                       │
        ┌────────────┬─────────────────┼──────────────┬────────────┐
        ▼            ▼                 ▼              ▼            ▼
 wined.app.…   cellar.wined.app.…  distributor.wined.app.…  api.wined.app.…  langfuse.wined.app.…
 (sommelier)   (cellar)            (distributor)            (Hono)           (observabilidad)
        │            │                 │              │            │
        └────────────┴─────────────────┴──────────────┴────────────┘
                                       │
                          (dokploy-network bridge)
                                       │
                ┌──────────────┬───────┴───────┬──────────────┐
                ▼              ▼               ▼              ▼
            postgres         redis           minio         langfuse
         (pgvector)        (BullMQ)      (S3 uploads)
```

## Patrón Dokploy (mismo que `role-play-clasing`, `fundae-system`, `SGC`)

- **Dokploy**: http://15.237.213.46:3000
- **Dominio**: `*.15.237.213.46.nip.io` (HTTP por ahora — sin SSL)
- **Reverse proxy**: Traefik integrado en Dokploy (network `dokploy-network`)
- **Source**: GitHub Clasing/wined (privado) + Deploy Key SSH

## Hostnames asignados

| Servicio        | Host                                         | Puerto interno | Pública         |
| --------------- | -------------------------------------------- | -------------- | --------------- |
| Sommelier web   | `wined.app.15.237.213.46.nip.io`             | 3000           | ✅              |
| Cellar web      | `cellar.wined.app.15.237.213.46.nip.io`      | 3000           | ✅              |
| Distributor web | `distributor.wined.app.15.237.213.46.nip.io` | 3000           | ✅              |
| API (Hono)      | `api.wined.app.15.237.213.46.nip.io`         | 8787           | ✅              |
| Langfuse        | `langfuse.wined.app.15.237.213.46.nip.io`    | 3000           | ✅ (admin only) |
| Minio console   | `minio.wined.app.15.237.213.46.nip.io`       | 9001           | ✅ (admin only) |
| Postgres        | (interno)                                    | 5432           | ❌              |
| Redis           | (interno)                                    | 6379           | ❌              |

> Cuando se compre el dominio `wined.app`, basta cambiar `WINED_HOST=wined.app` en Dokploy y los hosts pasan a ser `wined.app`, `cellar.wined.app`, `api.wined.app`, etc. Cero cambios de código.

## Pasos de deploy (one-time setup)

### 1. Crear repo en GitHub

```bash
gh repo create Clasing/wined --private --description "Wined — copiloto agéntico del vino"
cd wine-app
git init
git add .
git commit -m "feat: initial Wined MVP (83 steps)"
git branch -M main
git remote add origin git@github.com:Clasing/wined.git
git push -u origin main
```

### 2. Generar SSH deploy key

En Dokploy → **SSH Keys** → "Add SSH Key":

- Name: `wined-deploy`
- Description: "Deploy key para github.com/Clasing/wined"
- Click "Generate" (ED25519)
- Copia la public key

En GitHub:

```bash
gh api repos/Clasing/wined/keys -X POST \
  -f title='dokploy-wined-deploy' \
  -f key='ssh-ed25519 AAAA... dokploy' \
  -F read_only=true
```

### 3. Crear el proyecto Wined en Dokploy

En Dokploy → "Create Project" → name: `Wined`.

Dentro del proyecto, "Create Service" → **Compose** (no "Application"):

- Name: `wined-stack`
- Provider: **Git** (no GitHub App)
- Repository URL: `git@github.com:Clasing/wined.git`
- SSH Key: `wined-deploy`
- Branch: `main`
- Compose Path: `docker-compose.yml`

### 4. Variables de entorno

En Dokploy → Wined → wined-stack → **Environment** tab. Pegar (sin comillas):

```env
# Secretos generados (32+ chars cada uno)
POSTGRES_PASSWORD=<openssl rand -hex 24>
MINIO_ROOT_USER=wined-minio
MINIO_ROOT_PASSWORD=<openssl rand -hex 24>
LANGFUSE_NEXTAUTH_SECRET=<openssl rand -hex 32>
LANGFUSE_SALT=<openssl rand -hex 16>

# JWT (32+ chars cada uno; generar con openssl rand -hex 32)
JWT_SECRET=<openssl rand -hex 32>
JWT_REFRESH_SECRET=<openssl rand -hex 32>

# LLM providers
ANTHROPIC_API_KEY=sk-ant-xxxxxxxx
COHERE_API_KEY=xxxxxxxx

# Observabilidad
LANGFUSE_PUBLIC_KEY=pk-lf-xxxxxxxx
LANGFUSE_SECRET_KEY=sk-lf-xxxxxxxx
POSTHOG_API_KEY=phc_xxxxxxxx

# Integrations
APIFY_API_TOKEN=apify_api_xxxxxxxx
RESEND_API_KEY=re_xxxxxxxx

# Domain
# Hoy nip.io; cuando se compre wined.app pon "wined.app"
WINED_HOST=wined.app.15.237.213.46.nip.io
```

### 5. Deploy

En Dokploy → Wined → wined-stack → **Deploy**.

El primer build tarda ~6-8 min (`pnpm install` + 4 builds Turbo). Builds siguientes ~2 min gracias al cache.

### 6. Bootstrap del corpus

Una vez en producción, los curators Opus/Sonnet deben poblar la KB inicial. Desde el host de Dokploy:

```bash
docker compose -p wined exec api node packages/curators/dist/cli.js regulation
docker compose -p wined exec api node packages/curators/dist/cli.js do
docker compose -p wined exec api node packages/curators/dist/cli.js catalog
```

O via API (admin):

```bash
curl -X POST https://api.wined.app.15.237.213.46.nip.io/v1/admin/curate/regulation \
  -H "Authorization: Bearer <admin-jwt-de-/api/v1/auth/login>"
```

### 7. Cron jobs (GitHub Actions)

Los workflows en `.github/workflows/` ya están listos:

- `corpus-reviewer-cron.yml` — semanal lunes 03:00 UTC
- `gdpr-hard-delete-cron.yml` — diario 04:00 UTC
- `citation-validator-cron.yml` — diario 05:00 UTC
- `onboarding-reminder-cron.yml` — diario 09:00 UTC
- `posthog-sync-cron.yml` — cada 15 min
- `scheduled-ops-reminder-cron.yml` — horario

Configura los secrets en GitHub Settings → Actions:

- `DATABASE_URL_PROD`
- `REDIS_URL_PROD`
- `ANTHROPIC_API_KEY`, `COHERE_API_KEY`, `LANGFUSE_*`, `POSTHOG_*`, `RESEND_API_KEY`

> 💡 Para que los cron jobs lleguen a postgres/redis dentro de Dokploy hay dos opciones:
> a) Abrir puertos públicos temporalmente (no recomendado).
> b) Mejor: añadir un endpoint `/v1/admin/cron/:name` a la API que dispare cada cron via auth admin, y que los GitHub Actions sólo hagan `curl` al endpoint.

## Comandos útiles

```bash
# Ver logs de cualquier servicio
docker compose -p wined logs -f api
docker compose -p wined logs -f sommelier-web

# Aplicar una migración SQL nueva manualmente
docker compose -p wined exec -T postgres psql -U wined -d wined < infra/sql/00XX_nuevo.sql

# Estado de las colas BullMQ
docker compose -p wined exec api node -e "
  const { Queue } = require('bullmq');
  const r = new (require('ioredis'))('redis://redis:6379');
  for (const name of ['ingestion.classify','ingestion.embed','curator','gdpr.export']) {
    const q = new Queue(name, { connection: r });
    q.getJobCounts().then(c => console.log(name, c));
  }
"

# Rebuild de una sola imagen
docker compose -p wined build api
docker compose -p wined up -d api
```

## Desarrollo local

```bash
# Stack mínimo (postgres + redis + minio) en puertos remapeados
docker compose -f infra/docker-compose.dev.yml up -d

# Variables en wine-app/.env (no commited; ver .env.example)

# API
pnpm --filter @wined/api dev      # http://localhost:8787

# Web app
pnpm --filter @wined/sommelier-web dev   # http://localhost:3100
```

## Diferencias vs. el patrón de `role-play-clasing`

| Aspecto        | role-play-clasing       | Wined                                                                       |
| -------------- | ----------------------- | --------------------------------------------------------------------------- |
| Stack          | Single Express + SQLite | Monorepo Turborepo: 4 apps + 10 packages                                    |
| DB             | SQLite file en volumen  | Postgres + pgvector + RLS                                                   |
| Dockerfiles    | 1 en root               | 4 (api + 3 web), multi-stage con `turbo prune`                              |
| Compose        | Sin (deploy directo)    | `docker-compose.yml` para Dokploy + `infra/docker-compose.dev.yml` para dev |
| Observabilidad | Logs Dokploy            | Langfuse (LLM) + PostHog (producto)                                         |
| Auth           | Custom JWT              | Custom JWT (mismo patrón que Fundae/SGC)                                    |

Resto idéntico (Dokploy + Traefik + nip.io + deploy key SSH + GitHub Actions cron).
