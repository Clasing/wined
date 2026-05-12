# Plan: Wined — Multi-tenant SaaS B2B (Sommelier + Cellar + Distributor)

> **Audiencia**: ejecutado por agente `coder` paso a paso. Cada step es autónomo: rutas absolutas, signatures TypeScript/Zod, snippets SQL exactos, comandos de shell.
> **Raíz del monorepo**: `/Users/adrianaybar/Downloads/role-play-clasing/.claude/worktrees/suspicious-pasteur-cbfd64/wine-app/`
> En adelante, **`$ROOT`** = esa ruta.
> **Versión**: 2.0 — regenerado tras CROSSCHECK.md aplicado y decisiones del usuario incorporadas.

## 0. Diferimientos explícitos (Fase 2+)

Estos puntos del SPEC **se difieren** y NO se implementan en MVP. Quedan placeholders de extensibilidad:

- **Audio / Whisper / dictado** (ING-01 menciona audio "MUST" — resolución: se difiere a Fase 2 por decisión del usuario; el bus de ingestion lleva un `parser` registry abierto para añadir `audio.ts` sin migración).
- **Idiomas regionales** (catalán `cat`, gallego `glg`, euskera `eus`). MVP: `eng+spa` en Tesseract; el chunk lleva campo `language` ya en schema para extensión futura.
- **Tiering de planes**. MVP: plan único `pilot` con límites técnicos generosos; columnas Stripe + `plan` quedan en schema pero NO se aplica enforcement de cuota.
- **Integraciones POS/ERP/IoT** (Vintrace, InnoVint, Lightspeed, sensores).
- **Aplicación móvil nativa + modo offline** (SOM-22 W).
- **Marketplace de plugins / red social entre tenants.**
- **Reconocimiento de imagen de etiqueta de botella.**
- **Mercados fuera de España** (corpus normativo distinto).

Cualquier step marcado `[BLOQUEA-CODIGO]` requiere input humano antes de codear (ej: qué pliego DO subimos primero, qué libro técnico es el seed inicial).

---

## 1. Resumen arquitectónico

```
                                    ┌────────────────────────────────────────────────────────┐
                                    │                  CLIENTES (Web)                         │
                                    │ sommelier-web   cellar-web   distributor-web  (Next.js)│
                                    └─────────────────────────┬──────────────────────────────┘
                                                              │ HTTPS / SSE
                                                              │ Clerk JWT (orgId, userId, product)
                                                              ▼
                          ┌──────────────────────────────────────────────────────────┐
                          │                  apps/api (Hono on Fly.io)                │
                          │ /v1/chat (SSE) | /v1/ingest | /v1/agents/:agent           │
                          │ /v1/me/* (GDPR) | /v1/messages/:id/feedback | /v1/admin/* │
                          │ /v1/admin/curate/:source  (curator on-demand)             │
                          │ middlewares: clerk → tenantGuard → rateLimit → disclaimer │
                          │              → citationGate (technical answers)            │
                          └────────┬──────────────────┬───────────────────────────────┘
                                   │                  │
       ┌───────────────────────────┘                  └────────────────────────────┐
       ▼                                                                            ▼
┌──────────────────────────┐                                       ┌────────────────────────────┐
│  Router (Haiku)           │                                       │     Ingestion Pod           │
│  + Redis semantic cache   │                                       │ classifier/extractor/PII    │
│  + intent classifier      │                                       │ (Sonnet, BullMQ queue)      │
└────┬─────────────────────┘                                       │ parsers: pdf/xlsx/docx/img/  │
     │ miss                                                         │ csv  (audio placeholder)    │
     ▼                                                              └──────────────┬─────────────┘
┌──────────────────────────────────────────────────────────┐                       │
│  Specialist Pods (Sonnet)                                 │                       ▼
│  ┌Sommelier──────────┐ ┌Cellar────────────┐ ┌Distributor┐│      ┌────────────────────────────┐
│  │pairing/tasting/    │ │enology/compliance/│ │catalog-nl││      │ Embedding worker            │
│  │inventory/guest/    │ │calc/journal/      │ │/ comm-   ││      │ EmbeddingProvider abstraction│
│  │service-mode/menu   │ │anomaly/lab        │ │ sheet    ││      │ (Cohere v3 default)         │
│  └────────────────────┘ └───────────────────┘ └──────────┘│      └──────────────┬─────────────┘
└───────────────────┬──────────────────────────────────────┘                      │
                    │                                                              ▼
                    │ tool calls + RAG                                  ┌────────────────────────┐
                    ▼                                                   │ Postgres 16 + pgvector  │
┌──────────────────────────────────────────────────────────┐            │ HNSW partitioned by org │
│  packages/llm-gateway                                     │            │ RLS FORCED              │
│  - generate / stream                                      │◄───────────┤  ~28 tables             │
│  - semantic-cache (Redis, TTL 24h, thr 0.93)              │            └──────┬──────────────────┘
│  - model fallback (Sonnet→Haiku)                          │                   │
│  - rate-limit per-tenant token-bucket                     │                   │
│  - citation gate runtime (technical responses)             │                   ▼
│  - source-tier ranking (regulation > consensus > literature)│           ┌────────────────────────┐
│  - Langfuse tracing                                       │            │ Object store (S3/R2)   │
└─────────────────────────────┬────────────────────────────┘             └────────────────────────┘
                              │
                              ▼
       ┌────────────────────────────────────────────────────────────────────┐
       │                       CURATOR POD (cron + on-demand)                │
       │  regulation-curator (Opus) │ do-curator (Sonnet) │ book-curator     │
       │  catalog-curator (Sonnet)  │ corpus-reviewer (Opus, weekly)         │
       │  → regulatory_corpus, do_rules, wine_catalog_global, book_chunks    │
       │  → corpus_conflicts (with source_tier hierarchy)                    │
       └────────────────────────────────────────────────────────────────────┘

  Observability: Langfuse (técnica) + PostHog (producto: WAU/MAU/funnel/cohort/NPS/cost)
```

---

## 2. Estructura del monorepo

```
wine-app/
├── package.json                         # pnpm workspaces, turbo
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
├── .env.example  .gitignore  .nvmrc (20.11.0)  README.md
├── .github/workflows/{ci.yml,evals.yml,deploy.yml,curators-cron.yml}
├── apps/
│   ├── sommelier-web/                   # Next.js 14 App Router
│   ├── cellar-web/
│   ├── distributor-web/                 # NUEVO — vertical first-class
│   └── api/                             # Hono
│       ├── src/
│       │   ├── index.ts  env.ts
│       │   ├── middleware/
│       │   │   ├── clerk.ts  tenant-guard.ts  rate-limit.ts  error.ts
│       │   │   ├── disclaimer.ts          # NUC-16 "soy IA"
│       │   │   └── citation-gate.ts       # I-11 citas obligatorias
│       │   ├── routes/
│       │   │   ├── chat.ts  ingest.ts  agents.ts  admin.ts  health.ts
│       │   │   ├── me.ts                  # GDPR endpoints
│       │   │   ├── feedback.ts            # NUC-14
│       │   │   ├── memory.ts              # NUC-03 user_memory
│       │   │   ├── curate.ts              # on-demand curator triggers
│       │   │   └── distributor.ts         # commercial sheets PDF
│       │   └── workers/{ingestion,embedding,curator,citation-validator}.ts
├── packages/
│   ├── db/                              # Drizzle ORM
│   │   ├── drizzle.config.ts
│   │   ├── src/schema/                  # ~28 tablas (ver §3)
│   │   ├── src/rls.ts
│   │   └── migrations/
│   ├── auth/                            # Clerk wrappers
│   ├── llm-gateway/
│   │   └── src/{index,providers/anthropic,providers/cohere,cache/semantic-cache,
│   │             rate-limit,citation-gate,source-tier,langfuse,types}.ts
│   ├── embedding/                       # NUEVO — abstraction
│   │   └── src/{provider.ts,cohere.ts,voyage.ts,openai.ts,index.ts}
│   ├── agents/
│   │   └── src/
│   │       ├── framework/{agent,tool,registry,abstention}.ts
│   │       ├── router/index.ts
│   │       ├── sommelier/{pairing,tasting,inventory,guest-memory,service-mode,menu}.ts
│   │       ├── cellar/{enology,compliance,calc,journal,anomaly,lab-analysis}.ts
│   │       ├── distributor/{catalog-nl,commercial-sheet}.ts
│   │       └── ingestion/{classifier,extractor,pii}.ts
│   ├── curators/                        # NUEVO pod separado
│   │   └── src/
│   │       ├── framework/{curator.ts,cron.ts}
│   │       ├── regulation-curator.ts    # Opus
│   │       ├── do-curator.ts            # Sonnet
│   │       ├── book-curator.ts          # Sonnet (tenant-scope)
│   │       ├── catalog-curator.ts       # Sonnet
│   │       └── corpus-reviewer.ts       # Opus weekly
│   ├── wine-kb/                         # global catalog utils
│   ├── ingestion/
│   │   └── src/
│   │       ├── pipeline.ts
│   │       ├── parsers/{pdf,xlsx,docx,image-ocr,csv}.ts   # audio: placeholder
│   │       ├── chunker.ts  embedder.ts  versioning.ts  pii.ts
│   │       └── confidence.ts            # OCR score
│   ├── analytics/                       # PostHog wrapper
│   │   └── src/{events.ts,posthog.ts,funnels.ts,nps.ts}
│   ├── pdf-export/                      # commercial sheets, wine lists EN, GDPR ZIP
│   │   └── src/{commercial-sheet.ts,wine-list-export.ts,gdpr-export.ts}
│   ├── ui/                              # shadcn + Tailwind shared
│   └── evals/
└── infra/
    ├── fly.toml  docker-compose.yml
    └── sql/{0001_init.sql, 0002_curators.sql, 0003_cellar_entities.sql,
              0004_sommelier_entities.sql, 0005_distributor.sql,
              0006_gdpr_and_feedback.sql, 0007_analytics.sql}
```

### 2.1 `package.json` raíz
```json
{
  "name": "wined", "private": true, "packageManager": "pnpm@9.10.0",
  "scripts": {
    "build": "turbo run build", "dev": "turbo run dev",
    "lint": "turbo run lint", "test": "turbo run test", "typecheck": "turbo run typecheck",
    "db:migrate": "pnpm --filter @wined/db migrate",
    "db:push": "pnpm --filter @wined/db push",
    "curators:run": "pnpm --filter @wined/curators run",
    "evals": "pnpm --filter @wined/evals run"
  },
  "devDependencies": { "turbo": "2.1.3", "typescript": "5.5.4", "@types/node": "20.14.0", "tsx": "4.19.0", "eslint": "9.9.0", "prettier": "3.3.3" },
  "engines": { "node": ">=20.11.0" }
}
```

### 2.2 `pnpm-workspace.yaml`
```yaml
packages: ["apps/*", "packages/*"]
```

---

## 3. Schema de base de datos (~28 tablas)

Postgres 16 + extensiones: `vector`, `pgcrypto`, `uuid-ossp`, `pg_trgm`.

### 3.1 `infra/sql/0001_init.sql` — núcleo

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ===== ENUMS =====
CREATE TYPE org_product AS ENUM ('sommelier','cellar','distributor','both');
CREATE TYPE membership_role AS ENUM ('owner','admin','member','viewer','external');
CREATE TYPE doc_type AS ENUM (
  'tasting_note','wine_list','invoice','technical_sheet','vinification_log',
  'compliance_doc','lab_report','contract','book','regulation','do_pliego',
  'menu','sales_report','generic'
);
CREATE TYPE doc_status AS ENUM ('uploaded','classifying','parsing','embedding','ready','failed','quarantined_pii');
CREATE TYPE agent_pod AS ENUM ('router','sommelier','cellar','distributor','ingestion','curator');
CREATE TYPE source_tier AS ENUM ('regulation','consensus','literature','tenant_private','global_catalog');
CREATE TYPE org_status AS ENUM ('active','suspended','pending_delete');

-- ===== ORG / USER / MEMBERSHIP =====
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clerk_org_id TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  product org_product NOT NULL DEFAULT 'sommelier',
  locale TEXT NOT NULL DEFAULT 'es',
  output_language TEXT NOT NULL DEFAULT 'es',   -- NUC-07
  kb_preference TEXT NOT NULL DEFAULT 'private_first',  -- NUC-13: 'private_first'|'global_first'|'show_both'
  status org_status NOT NULL DEFAULT 'active',
  delete_requested_at TIMESTAMPTZ,
  hard_delete_at TIMESTAMPTZ,                    -- Edge 13: 30d grace
  stripe_customer_id TEXT,
  plan TEXT NOT NULL DEFAULT 'pilot',            -- single plan in MVP
  onboarding_state JSONB NOT NULL DEFAULT '{}'::jsonb,  -- resumable wizard
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clerk_user_id TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL, full_name TEXT,
  preferred_language TEXT DEFAULT 'es',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role membership_role NOT NULL DEFAULT 'member',
  workspace_scope UUID[],                        -- SOM-09 limit to specific workspaces
  expires_at TIMESTAMPTZ,                        -- CEL-24 temporary consultant
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, user_id)
);
CREATE INDEX idx_mem_org ON memberships(organization_id);
CREATE INDEX idx_mem_user ON memberships(user_id);

-- ===== WORKSPACES (multi-establecimiento) =====
CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,                            -- 'restaurant'|'hotel'|'winery'|'distributor_branch'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ws_org ON workspaces(organization_id);

-- ===== DOCUMENTS =====
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  uploaded_by UUID REFERENCES users(id),
  filename TEXT NOT NULL, storage_url TEXT NOT NULL,
  mime_type TEXT NOT NULL, size_bytes BIGINT NOT NULL,
  content_hash TEXT NOT NULL,
  doc_type doc_type NOT NULL DEFAULT 'generic',
  status doc_status NOT NULL DEFAULT 'uploaded',
  version INTEGER NOT NULL DEFAULT 1,
  parent_doc_id UUID REFERENCES documents(id),
  is_active_version BOOLEAN NOT NULL DEFAULT true,   -- SOM-15
  language TEXT,                                     -- 'es','en','cat','glg','eus'...
  ocr_confidence NUMERIC(4,3),                       -- ING-08
  pii_detected BOOLEAN NOT NULL DEFAULT false,
  pii_consent_user_id UUID REFERENCES users(id),
  pii_consent_at TIMESTAMPTZ,
  source_tier source_tier NOT NULL DEFAULT 'tenant_private',
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, content_hash)
);
CREATE INDEX idx_doc_org_status ON documents(organization_id, status);
CREATE INDEX idx_doc_org_type_active ON documents(organization_id, doc_type, is_active_version);

-- ===== DOCUMENT CHUNKS (partitioned HASH x 16) =====
CREATE TABLE document_chunks (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  document_id UUID NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1024) NOT NULL,                 -- dim configurable via provider abstraction
  token_count INTEGER NOT NULL,
  source_tier source_tier NOT NULL DEFAULT 'tenant_private',
  language TEXT,
  page_number INTEGER,                              -- ING-11 book citation
  section_path TEXT,                                -- "Cap.4 > §4.2"
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, id)
) PARTITION BY HASH (organization_id);
DO $$ DECLARE i INT; BEGIN
  FOR i IN 0..15 LOOP
    EXECUTE format('CREATE TABLE document_chunks_p%1$s PARTITION OF document_chunks FOR VALUES WITH (MODULUS 16, REMAINDER %1$s);', i);
    EXECUTE format('CREATE INDEX idx_dc_p%1$s_hnsw ON document_chunks_p%1$s USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);', i);
    EXECUTE format('CREATE INDEX idx_dc_p%1$s_org_doc ON document_chunks_p%1$s (organization_id, document_id);', i);
    EXECUTE format('CREATE INDEX idx_dc_p%1$s_trgm ON document_chunks_p%1$s USING gin (content gin_trgm_ops);', i);
  END LOOP;
END$$;

-- ===== GLOBAL WINE CATALOG =====
CREATE TABLE wine_catalog_global (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  external_id TEXT, source TEXT,                   -- 'vivino'|'wine-searcher'|'manual'
  name TEXT NOT NULL, producer TEXT, country TEXT, region TEXT,
  do_appellation TEXT, vintage INTEGER, grape_varieties TEXT[],
  wine_type TEXT, style_notes TEXT,
  embedding vector(1024),
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_wcg_hnsw ON wine_catalog_global USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_wcg_trgm_name ON wine_catalog_global USING gin (name gin_trgm_ops);
CREATE INDEX idx_wcg_region ON wine_catalog_global (country, region);

-- ===== CONVERSATIONS / MESSAGES =====
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  workspace_id UUID REFERENCES workspaces(id),
  title TEXT, pod agent_pod NOT NULL,
  service_mode BOOLEAN NOT NULL DEFAULT false,    -- SOM-05
  disclaimer_shown BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_conv_org_user ON conversations(organization_id, user_id);

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  role TEXT NOT NULL,
  content JSONB NOT NULL,
  agent_name TEXT,
  citations JSONB,                                 -- [{doc_id, chunk_id, snippet, language, page}]
  citation_count INTEGER NOT NULL DEFAULT 0,
  is_technical BOOLEAN NOT NULL DEFAULT false,
  abstained BOOLEAN NOT NULL DEFAULT false,        -- "no tengo evidencia"
  tokens_in INTEGER, tokens_out INTEGER, latency_ms INTEGER,
  output_language TEXT,
  obsolete_reason TEXT,                            -- Edge 16 cita rota
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_msg_conv ON messages(conversation_id, created_at);
CREATE INDEX idx_msg_fts ON messages USING gin (to_tsvector('simple', content::text));  -- NUC-11

-- ===== AGENT INVOCATIONS =====
CREATE TABLE agent_invocations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  agent_name TEXT NOT NULL, tool_name TEXT,
  input JSONB, output JSONB,
  status TEXT NOT NULL, latency_ms INTEGER,
  retrieved_chunks JSONB,                          -- CEL-23 "show your work"
  langfuse_trace_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_org_agent ON agent_invocations(organization_id, agent_name, created_at);

-- ===== EVALS / AUDIT =====
CREATE TABLE evals_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID, dataset_id TEXT NOT NULL,
  dataset_version TEXT NOT NULL, agent_name TEXT NOT NULL,
  prompt_version TEXT NOT NULL, score NUMERIC(5,2) NOT NULL,
  per_example JSONB NOT NULL, run_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  organization_id UUID, user_id UUID,
  action TEXT NOT NULL, entity TEXT NOT NULL, entity_id TEXT,
  diff JSONB, ip INET, user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_org_created ON audit_log(organization_id, created_at);
```

### 3.2 `infra/sql/0002_curators.sql` — corpus normativo + curators

```sql
-- ===== REGULATORY CORPUS =====
CREATE TABLE regulatory_corpus (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source TEXT NOT NULL,                  -- 'EUR-Lex'|'BOE'|'OIV'|'DO'
  source_tier source_tier NOT NULL,
  jurisdiction TEXT NOT NULL,            -- 'EU'|'ES'|'ES-Rioja'|...
  reg_code TEXT NOT NULL,                -- 'Reg-UE-2019-934' | 'BOE-A-2019-...'
  article_ref TEXT,                      -- 'Anexo I Parte B § 2'
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  effective_date DATE, supersedes_id UUID REFERENCES regulatory_corpus(id),
  language TEXT NOT NULL DEFAULT 'es',
  embedding vector(1024),
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_reg_hnsw ON regulatory_corpus USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_reg_juri_code ON regulatory_corpus(jurisdiction, reg_code);
CREATE INDEX idx_reg_trgm ON regulatory_corpus USING gin (body gin_trgm_ops);

-- ===== DENOMINATIONS OF ORIGIN =====
CREATE TABLE denominations_of_origin (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,             -- 'DO-RIOJA','IGP-CV'
  name TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'ES',
  kind TEXT NOT NULL,                    -- 'DOCa'|'DO'|'IGP'|'VC'
  council_url TEXT,
  pliego_doc_id UUID REFERENCES regulatory_corpus(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE do_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  do_id UUID NOT NULL REFERENCES denominations_of_origin(id) ON DELETE CASCADE,
  rule_kind TEXT NOT NULL,               -- 'allowed_variety'|'max_yield'|'practice'|'labelling'
  payload JSONB NOT NULL,
  citation_id UUID REFERENCES regulatory_corpus(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_do_rules_do ON do_rules(do_id, rule_kind);

-- ===== CORPUS CONFLICTS (corpus-reviewer output) =====
CREATE TABLE corpus_conflicts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  detected_by TEXT NOT NULL,             -- 'corpus-reviewer'|'manual'
  source_a_id UUID, source_b_id UUID,
  topic TEXT NOT NULL,
  resolution TEXT NOT NULL,              -- ranking explanation
  resolution_tier source_tier NOT NULL,  -- which tier wins
  status TEXT NOT NULL DEFAULT 'open',   -- 'open'|'acknowledged'|'resolved'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===== CURATOR RUNS =====
CREATE TABLE curator_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  curator_name TEXT NOT NULL,
  trigger TEXT NOT NULL,                 -- 'cron'|'on_demand'
  organization_id UUID,                  -- NULL for global curators
  status TEXT NOT NULL,                  -- 'queued'|'running'|'ok'|'failed'
  stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ, finished_at TIMESTAMPTZ,
  langfuse_trace_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cur_runs_name ON curator_runs(curator_name, created_at);
```

### 3.3 `infra/sql/0003_cellar_entities.sql` — entidades dominio cellar first-class

```sql
CREATE TABLE vineyards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL, do_id UUID REFERENCES denominations_of_origin(id),
  plot_code TEXT, area_ha NUMERIC(8,4),
  altitude_m INTEGER, soil_type TEXT, varieties TEXT[],
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_vy_org ON vineyards(organization_id);

CREATE TABLE deposits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL, capacity_l NUMERIC(10,2),
  material TEXT,                         -- 'inox'|'concrete'|'oak'
  status TEXT NOT NULL DEFAULT 'empty',
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(organization_id, code)
);

CREATE TABLE vintages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  summary TEXT, weather_notes TEXT,
  closed_at TIMESTAMPTZ,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(organization_id, year)
);

CREATE TABLE wine_lots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,                    -- internal lot id
  vintage_id UUID REFERENCES vintages(id),
  vineyard_id UUID REFERENCES vineyards(id),
  deposit_id UUID REFERENCES deposits(id),
  do_id UUID REFERENCES denominations_of_origin(id),
  variety_blend JSONB,                   -- [{variety:'tempranillo',pct:80}]
  volume_l NUMERIC(10,2),
  status TEXT NOT NULL DEFAULT 'fermenting',
  started_at TIMESTAMPTZ, bottled_at TIMESTAMPTZ,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, code)
);
CREATE INDEX idx_lots_org_status ON wine_lots(organization_id, status);

CREATE TABLE lot_operations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lot_id UUID NOT NULL REFERENCES wine_lots(id) ON DELETE CASCADE,
  op_type TEXT NOT NULL,                 -- 'racking'|'sulfite'|'acidity_adj'|'clarif'|'transfer'|'fermentation_check'|'topping'
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  performed_by UUID REFERENCES users(id),
  inputs JSONB NOT NULL,                 -- e.g. {so2_added_g_hl: 3, kind:'K2S2O5'}
  notes TEXT,
  citation_ids UUID[],                   -- regulatory_corpus refs used for the decision
  agent_invocation_id UUID REFERENCES agent_invocations(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ops_lot_time ON lot_operations(lot_id, performed_at);

CREATE TABLE lab_analyses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lot_id UUID REFERENCES wine_lots(id) ON DELETE CASCADE,
  document_id UUID REFERENCES documents(id),
  sampled_at TIMESTAMPTZ,
  alcohol_pct NUMERIC(4,2), ph NUMERIC(4,2),
  total_acidity_g_l NUMERIC(5,2),        -- AT
  volatile_acidity_g_l NUMERIC(5,2),     -- AV (ING-04 fix)
  so2_free_mg_l NUMERIC(6,2), so2_total_mg_l NUMERIC(6,2),
  residual_sugar_g_l NUMERIC(6,2),
  malic_acid_g_l NUMERIC(5,2), lactic_acid_g_l NUMERIC(5,2),
  density NUMERIC(6,4),
  out_of_range_flags JSONB NOT NULL DEFAULT '[]'::jsonb,  -- ING-04 "alertas fuera de rango"
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_lab_lot_time ON lab_analyses(lot_id, sampled_at);

CREATE TABLE grape_intakes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vintage_id UUID REFERENCES vintages(id),
  vineyard_id UUID REFERENCES vineyards(id),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  variety TEXT NOT NULL,
  weight_kg NUMERIC(10,2) NOT NULL,
  baume NUMERIC(4,2), ph NUMERIC(4,2), sanity_score INTEGER,
  out_of_historical_flags JSONB NOT NULL DEFAULT '[]'::jsonb,  -- CEL-12
  meta JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX idx_intakes_org_vintage ON grape_intakes(organization_id, vintage_id);

-- Calendar of operations CEL-15
CREATE TABLE scheduled_operations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lot_id UUID REFERENCES wine_lots(id) ON DELETE CASCADE,
  op_type TEXT NOT NULL,
  due_at TIMESTAMPTZ NOT NULL,
  done_op_id UUID REFERENCES lot_operations(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sched_org_due ON scheduled_operations(organization_id, due_at);
```

### 3.4 `infra/sql/0004_sommelier_entities.sql`

```sql
CREATE TABLE wine_lists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id),
  name TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT false,    -- SOM-15
  source_doc_id UUID REFERENCES documents(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_winelist_active ON wine_lists(organization_id, workspace_id)
  WHERE is_active = true;

CREATE TABLE wine_list_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  list_id UUID NOT NULL REFERENCES wine_lists(id) ON DELETE CASCADE,
  global_wine_id UUID REFERENCES wine_catalog_global(id),
  display_name TEXT NOT NULL, producer TEXT, vintage INTEGER,
  do_appellation TEXT, wine_type TEXT,
  price_eur NUMERIC(8,2), price_glass_eur NUMERIC(8,2),
  stock INTEGER NOT NULL DEFAULT 0,
  in_stock BOOLEAN GENERATED ALWAYS AS (stock > 0) STORED,
  notes TEXT, meta JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX idx_wli_list_stock ON wine_list_items(list_id, in_stock);

CREATE TABLE restaurant_guests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id),
  display_name TEXT NOT NULL,                  -- alias preferred for PII minimization
  email_hash TEXT,                              -- hashed if provided
  pii_consent BOOLEAN NOT NULL DEFAULT false,
  consent_at TIMESTAMPTZ, consent_user_id UUID REFERENCES users(id),
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  aversions JSONB NOT NULL DEFAULT '[]'::jsonb,
  allergies JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_guests_org_ws ON restaurant_guests(organization_id, workspace_id);

CREATE TABLE guest_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  guest_id UUID NOT NULL REFERENCES restaurant_guests(id) ON DELETE CASCADE,
  list_item_id UUID REFERENCES wine_list_items(id),
  ordered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  liked BOOLEAN, notes TEXT
);
CREATE INDEX idx_gorders_guest_time ON guest_orders(guest_id, ordered_at);

CREATE TABLE tasting_menus (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id),
  name TEXT NOT NULL,
  source_doc_id UUID REFERENCES documents(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE dishes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  menu_id UUID REFERENCES tasting_menus(id) ON DELETE CASCADE,
  name TEXT NOT NULL, description TEXT,
  course_order INTEGER, descriptors JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 3.5 `infra/sql/0005_distributor.sql`

```sql
CREATE TABLE distributor_catalogs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source_doc_id UUID REFERENCES documents(id),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE distributor_catalog_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  catalog_id UUID NOT NULL REFERENCES distributor_catalogs(id) ON DELETE CASCADE,
  sku TEXT, global_wine_id UUID REFERENCES wine_catalog_global(id),
  display_name TEXT NOT NULL, producer TEXT, vintage INTEGER,
  do_appellation TEXT, wine_type TEXT,
  cost_eur NUMERIC(8,2), pvp_eur NUMERIC(8,2),
  stock INTEGER NOT NULL DEFAULT 0,
  technical_sheet_doc_id UUID REFERENCES documents(id),
  meta JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX idx_dci_cat ON distributor_catalog_items(catalog_id);

CREATE TABLE horeca_clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL, contact_email TEXT, contact_phone TEXT,
  segment TEXT,                                  -- 'fine_dining'|'bistro'|'hotel'
  city TEXT, notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE commercial_sheets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  catalog_item_id UUID REFERENCES distributor_catalog_items(id),
  horeca_client_id UUID REFERENCES horeca_clients(id),
  generated_by UUID REFERENCES users(id),
  content JSONB NOT NULL,                        -- structured: hero, tasting_notes, citations
  pdf_storage_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_csheets_org ON commercial_sheets(organization_id, created_at);
```

### 3.6 `infra/sql/0006_gdpr_and_feedback.sql`

```sql
-- ===== USER MEMORY (NUC-03) =====
CREATE TABLE user_memory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                            -- 'preference'|'fact'|'context'
  content TEXT NOT NULL,
  source_message_id UUID REFERENCES messages(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_umem_user_org ON user_memory(user_id, organization_id, is_active);

-- ===== MESSAGE FEEDBACK (NUC-14) =====
CREATE TABLE message_feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating IN (1,-1)),
  reason TEXT,                                    -- 'hallucination'|'wrong_cite'|'irrelevant'|'tone'|...
  comment TEXT,
  resolved_at TIMESTAMPTZ, resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id)
);
CREATE INDEX idx_fb_org_rating ON message_feedback(organization_id, rating, created_at);

-- ===== GDPR EXPORT JOBS =====
CREATE TABLE gdpr_export_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES users(id),
  scope TEXT NOT NULL,                            -- 'me'|'organization'
  status TEXT NOT NULL DEFAULT 'queued',
  zip_url TEXT, expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 3.7 `infra/sql/0007_analytics.sql`

```sql
CREATE TABLE analytics_events (
  id BIGSERIAL PRIMARY KEY,
  organization_id UUID, user_id UUID,
  event TEXT NOT NULL,                           -- 'signup','onboarding.step_completed','message.sent','feedback.given'
  props JSONB NOT NULL DEFAULT '{}'::jsonb,
  posthog_synced BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ae_event_time ON analytics_events(event, created_at);
CREATE INDEX idx_ae_org_time ON analytics_events(organization_id, created_at);
```

### 3.8 RLS policies (todas las tablas tenant-scoped)

```sql
-- Enable RLS on all tenant tables (and FORCE; app role is non-superuser)
DO $$ DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'organizations','workspaces','documents','document_chunks','tenant_kb',
    'conversations','messages','agent_invocations','audit_log','vineyards','deposits',
    'vintages','wine_lots','lot_operations','lab_analyses','grape_intakes',
    'scheduled_operations','wine_lists','wine_list_items','restaurant_guests',
    'guest_orders','tasting_menus','dishes','distributor_catalogs',
    'distributor_catalog_items','horeca_clients','commercial_sheets',
    'user_memory','message_feedback','gdpr_export_jobs','analytics_events'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format($p$
      CREATE POLICY org_iso_%1$s ON %1$I
        USING (organization_id::text = current_setting('app.current_org', true));
    $p$, t);
  END LOOP;
END$$;
-- Note: regulatory_corpus, denominations_of_origin, do_rules, corpus_conflicts,
-- wine_catalog_global, curator_runs are NOT tenant-scoped → no RLS.
```

`packages/db/src/rls.ts`:
```ts
export async function withTenant<T>(db: NodePgDatabase, orgId: string, fn: (tx: any)=>Promise<T>) {
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT set_config('app.current_org', ${orgId}, true)`);
    return fn(tx);
  });
}
```

---

## 4. Pipeline de ingestion

### 4.1 Flujo

```
POST /v1/ingest (multipart)
  → store raw → S3/R2 (path: org/{org_id}/{hash}.{ext})
  → INSERT documents(status='uploaded',content_hash)  [dedup by UNIQUE]
  → enqueue BullMQ 'ingestion:classify' { document_id }
        worker:
          1. classifier-agent(Sonnet) → doc_type + language + source_tier
          2. status='parsing' → parser-by-mime
             - pdf  → pdf-parse → if scanned/low text → tesseract eng+spa → ocr_confidence
             - xlsx → SheetJS → tabular
             - docx → mammoth
             - csv  → papaparse                            (NEW)
             - image→ tesseract (with ocr_confidence)
             - audio→ TODO Fase 2 (placeholder throws "AUDIO_NOT_SUPPORTED_MVP")
          3. if ocr_confidence < 0.70 → emit UI warning event, set status='failed' optional re-upload
          4. PII detect (regex DNI/email/phone + Sonnet pass on first 2k chars):
             - if PII found → status='quarantined_pii' → block until consent (POST /v1/ingest/:id/pii-consent)
          5. extractor-agent(Sonnet) → structured rows by doc_type (wine_list/technical_sheet/lab_report/menu/...)
          6. chunker (semantic, ~700 tokens, overlap 80; book-aware for doc_type='book')
          7. enqueue 'ingestion:embed' per chunk batch
        embedding worker:
          - EmbeddingProvider.embed(chunks[]) → bulk INSERT document_chunks (vector(1024))
          - status='ready'; emit document.ready event
```

### 4.2 Versionado y re-embedding (ING-07)

`packages/ingestion/src/versioning.ts`:
```ts
export interface ChunkDiff { added: Chunk[]; removed: string[]; kept: string[] }
export async function diffAndPersist(prev: Document, next: Document): Promise<ChunkDiff>;
```

Algoritmo: hash por chunk (`sha256(content)`); reembed solo `added`; `removed` se marca `meta.archived=true` (no se borra para preservar referencias).

### 4.3 Audio (placeholder Fase 2)

`packages/ingestion/src/parsers/audio.ts`:
```ts
export function parseAudio(): never {
  throw new Error('AUDIO_NOT_SUPPORTED_MVP — deferred to Fase 2');
}
```

---

## 5. Topología de agentes (4 pods + Curator pod)

### 5.1 Agent framework

`packages/agents/src/framework/agent.ts`:
```ts
export interface AgentDef {
  name: string; pod: 'router'|'sommelier'|'cellar'|'distributor'|'ingestion'|'curator';
  model: 'haiku'|'sonnet'|'opus';
  systemPrompt: string;
  tools: Tool[];
  ragCorpus?: { tenant: boolean; docTypes?: DocType[]; global?: ('regulatory'|'do'|'catalog')[] };
  technical: boolean;          // if true, citation gate enforced
  maxTokens?: number; temperature?: number;
}
export interface Tool {
  name: string; description: string;
  input: z.ZodSchema; handler: (input: any, ctx: AgentContext) => Promise<any>;
}
export interface AgentContext {
  organizationId: string; userId: string; workspaceId?: string;
  conversationId: string; outputLanguage: 'es'|'en';
  kbPreference: 'private_first'|'global_first'|'show_both';
  serviceMode: boolean;
}
```

### 5.2 Pods y agentes (resumen ~20)

| Pod | Agent | Modelo | Tools clave |
|---|---|---|---|
| Router | `router` | Haiku | `classifyIntent`, semantic-cache lookup |
| Sommelier | `pairing` | Sonnet | `search_wine_list`, `match_dish_to_wines`, `filter_in_stock`, `cite_descriptor` |
| Sommelier | `tasting` | Sonnet | `lookup_wine_global`, `tasting_note_compose` |
| Sommelier | `inventory` | Sonnet | `search_tenant_inventory` (NL2query) |
| Sommelier | `guest-memory` | Sonnet | `get_guest`, `upsert_guest_pref`, `recent_orders` |
| Sommelier | `service-mode` | Sonnet (low-temp, ≤40 words) | same tools, prompt variant |
| Sommelier | `menu` | Sonnet | `parse_menu`, `link_dish_to_pairings` |
| Cellar | `enology` | Sonnet | RAG over `regulatory_corpus`+books, `cite_regulation` |
| Cellar | `compliance` | Sonnet | `lookup_do_rule(do_code, topic)`, `cite_pliego` |
| Cellar | `calc` | Sonnet | `so2_active_dose`, `acidity_adjustment`, `clarifier_dose`, `baume_brix_abv`, `chaptalization` (each returns dose + citation_id) |
| Cellar | `journal` | Sonnet | `list_lot_ops`, `record_op`, `compare_vintages` |
| Cellar | `anomaly` | Sonnet | `analyze_fermentation_state`, `suggest_interventions` |
| Cellar | `lab-analysis` | Sonnet | `ingest_lab_pdf`, `flag_out_of_range`, `link_to_lot` |
| Distributor | `catalog-nl` | Sonnet | `search_distributor_catalog`, `filter_stock_price` |
| Distributor | `commercial-sheet` | Sonnet | `gen_commercial_sheet_payload` (PDF rendered by `pdf-export`) |
| Ingestion | `classifier` | Sonnet | (no tools, pure classification) |
| Ingestion | `extractor` | Sonnet | doc-type specific extractors |
| Ingestion | `pii` | Haiku | `redact`, `summarize_pii_findings` |
| Curator | `regulation-curator` | **Opus** | fetch EUR-Lex/BOE/OIV, parse articles, dedupe, supersede detection |
| Curator | `do-curator` | Sonnet | parse DO pliego → `do_rules` rows |
| Curator | `book-curator` | Sonnet (tenant-scope) | book-aware chunking with page/section |
| Curator | `catalog-curator` | Sonnet | normalize Vivino/Wine-Searcher dumps |
| Curator | `corpus-reviewer` | **Opus** | weekly cron; detect conflicts, write `corpus_conflicts` |

### 5.3 System prompts esqueleto (reales, no placeholders)

`packages/agents/src/sommelier/pairing.ts`:
```ts
export const pairingAgent: AgentDef = {
  name: 'pairing', pod: 'sommelier', model: 'sonnet', technical: false,
  systemPrompt: `You are Wined's Sommelier Pairing agent.
RULES:
- Recommend ONLY wines present in the active wine_list of the tenant (use search_wine_list).
- If serviceMode=true, max 40 words; one wine per recommendation unless asked.
- Output language: {{outputLanguage}}. If you cite a tasting note in a different language, include the original + a translation.
- If no in-stock match exists, say so explicitly and suggest a global alternative tagged as "not in your list".
- Never invent producers, vintages or DOs. If unsure → abstain: "no tengo evidencia suficiente para esta recomendación".
TOOLS: search_wine_list, match_dish_to_wines, filter_in_stock.`,
  tools: [searchWineList, matchDishToWines, filterInStock],
  ragCorpus: { tenant: true, docTypes: ['wine_list','tasting_note','menu'] },
};
```

`packages/agents/src/cellar/enology.ts`:
```ts
export const enologyAgent: AgentDef = {
  name: 'enology', pod: 'cellar', model: 'sonnet', technical: true,
  systemPrompt: `You are Wined's Enology Specialist.
HARD RULES (non-negotiable):
- Every technical claim MUST include at least ONE citation [reg:<id>] or [doc:<id>] returned by tools.
- Source tier hierarchy: regulation > consensus(OIV) > literature > tenant_private. State the tier when sources conflict.
- If no evidence exists in the corpus: respond "No tengo evidencia en mi corpus para responder con certeza" and suggest what document to upload. NEVER fabricate.
- Refuse medical, legal-personal or financial advice → redirect to a qualified professional.
- Cite in the source's original language and include a translation of the cited sentence into {{outputLanguage}}.
TOOLS: ragSearch(regulatory_corpus,books), cite_regulation, lookup_do_rule.`,
  tools: [ragSearchRegulatory, citeRegulation, lookupDoRule],
  ragCorpus: { tenant: true, docTypes: ['book','technical_sheet','vinification_log','lab_report'],
               global: ['regulatory','do'] },
};
```

`packages/curators/src/regulation-curator.ts`:
```ts
export const regulationCurator: AgentDef = {
  name: 'regulation-curator', pod: 'curator', model: 'opus', technical: true,
  systemPrompt: `You are the Regulation Curator. Your job: ingest official wine regulation sources
(EUR-Lex, BOE, OIV resolutions) and produce normalized rows for the regulatory_corpus table.
For each article you must extract: source, jurisdiction, reg_code, article_ref, title, body (verbatim),
effective_date, supersedes (if any). Detect derogations across versions.
Output JSON matching schema RegulationArticleSchema. Skip preambles. Preserve original language.
If unsure about a derogation, flag with confidence:'low' and do not assert supersedes.`,
  tools: [fetchUrl, parseHtml, dedupeBySemanticHash, writeRegulatoryRow],
};
```

`packages/curators/src/corpus-reviewer.ts`:
```ts
export const corpusReviewer: AgentDef = {
  name: 'corpus-reviewer', pod: 'curator', model: 'opus', technical: true,
  systemPrompt: `You are the Corpus Reviewer. Weekly job: scan recently ingested
regulatory_corpus entries and tenant book chunks. Detect contradictions on shared topics
(e.g. SO2 max limits, allowed practices, labelling). For each conflict:
- emit corpus_conflicts row with: topic, source_a_id, source_b_id, resolution explanation,
  resolution_tier (the winning tier per hierarchy regulation > OIV > literature).
- mark obsolete chunks (set meta.obsolete=true) when a superseding regulation invalidates them.
Be conservative; flag for human review when ambiguity remains.`,
  tools: [pgQuery, writeConflictRow, markChunkObsolete],
};
```

---

## 6. LLM Gateway con citation gate

`packages/llm-gateway/src/index.ts`:
```ts
export interface GatewayRequest {
  agent: AgentDef; messages: Msg[]; ctx: AgentContext;
  technical?: boolean; abstainOnEmptyRag?: boolean;
}
export interface GatewayResponse {
  text: string; citations: Citation[]; abstained: boolean;
  tokensIn: number; tokensOut: number; latencyMs: number;
  cacheHit: boolean; traceId: string;
}
export class LLMGateway {
  async stream(req: GatewayRequest): AsyncIterable<StreamChunk>;
  async generate(req: GatewayRequest): Promise<GatewayResponse>;
}
```

`packages/llm-gateway/src/citation-gate.ts`:
```ts
/** If agent.technical=true and response has zero citations,
 *  replace response with abstention text and set abstained=true. */
export function citationGate(res: GatewayResponse, agent: AgentDef, lang: 'es'|'en'): GatewayResponse {
  if (!agent.technical) return res;
  if (res.citations.length === 0) {
    const msg = lang === 'es'
      ? 'No tengo evidencia en mi corpus para responder con certeza. ¿Puedes compartir el documento o ficha relevante?'
      : "I don't have evidence in my corpus to answer with certainty. Could you share the relevant document?";
    return { ...res, text: msg, abstained: true };
  }
  return res;
}
```

`packages/llm-gateway/src/source-tier.ts`:
```ts
/** Re-rank retrieved chunks by source_tier: regulation > consensus > literature > tenant_private.
 *  Tie-break by cosine similarity. Respect org.kb_preference. */
export function rankByTier(chunks: RetrievedChunk[], kbPref: KbPref): RetrievedChunk[];
```

Semantic-cache: Redis, key `sha256(orgId|agent|normalized_prompt|outputLang)`, TTL 24h, similarity threshold 0.93.

EmbeddingProvider abstraction (`packages/embedding/src/provider.ts`):
```ts
export interface EmbeddingProvider {
  name: string; dim: number;
  embed(texts: string[]): Promise<number[][]>;
}
export const cohereV3: EmbeddingProvider;     // dim=1024, default
export const voyage3:  EmbeddingProvider;     // alt
export const openai3Large: EmbeddingProvider; // alt
// Env: EMBEDDING_PROVIDER=cohere|voyage|openai
```

---

## 7. Evals + observabilidad

### 7.1 Langfuse (técnica)
- Trace per agent invocation. Spans: retrieval, tool calls, model.
- Métricas: p50/p95/p99 por agente y categoría (chat <6s, lot analysis <15s), tokens in/out, cache hit ratio (target ≥60%), error rate.

### 7.2 PostHog (producto)
Events emitted via `packages/analytics`:
- `signup`, `onboarding.started`, `onboarding.step_completed`, `onboarding.completed`
- `document.uploaded`, `document.ready`, `message.sent`, `message.cited`, `feedback.given`
- `wine_list.published`, `lot.created`, `commercial_sheet.generated`
- `workspace.delete_requested`, `subscription.cancelled`

Funnels: signup → onboarding completed → first cited answer.
Cohorts: WAU/MAU by product. NPS pipeline (in-app survey monthly).
Cost-per-user dashboard (Postgres view × PostHog active users).

### 7.3 Eval datasets
`packages/evals/src/datasets/global/`:
- `pairing.json` (≥80 examples)
- `enology-cited.json` (≥80, including 10 "no tengo evidencia" cases + 10 bilingual citations)
- `parsing-recall.json` (PDF wine lists with ground-truth row count)
- `distributor-nl.json` (≥40)
- `do-compliance.json` (≥40 rule-lookup)

LLM-as-judge rubric scores: correctness, citation-present, citation-correct, abstention-appropriate, tone, language. CI fails if any agent <0.80.

---

## 8. Plan paso a paso (~80 steps en 8 fases)

> Cada step: **Why / What / How / Done when / Dependencies / Parallelizable with**.
> Rutas absolutas siempre desde `$ROOT`.

### FASE 0 — Setup (steps 1-5)

#### Step 1: Bootstrap monorepo
- **Why**: base mínima para ejecutar todo lo demás.
- **What**: pnpm + Turbo + tsconfig base + .nvmrc + .gitignore + README skeleton.
- **How**: `pnpm init` en `$ROOT`; pegar `package.json` raíz §2.1, `pnpm-workspace.yaml` §2.2, `turbo.json`, `tsconfig.base.json`. Crear directorios `apps/ packages/ infra/sql/`.
- **Done when**: `pnpm install` OK; `turbo run --help` OK.
- **Deps**: ninguno.
- **Parallel**: —.

#### Step 2: Variables de entorno
- **Why**: contrato explícito.
- **What**: `.env.example` con DATABASE_URL, REDIS_URL, S3_*, CLERK_*, ANTHROPIC_API_KEY, COHERE_API_KEY, EMBEDDING_PROVIDER=cohere, LANGFUSE_*, POSTHOG_*, OBJECT_STORE_BUCKET, NODE_ENV.
- **How**: archivo plano + carga vía `@t3-oss/env-core` en `apps/api/src/env.ts`.
- **Done when**: `tsx apps/api/src/env.ts` falla limpiamente sin secretos y no en runtime.
- **Deps**: 1.

#### Step 3: docker-compose local (postgres, redis, langfuse, minio)
- **Why**: dev reproducible.
- **What**: `infra/docker-compose.yml` con servicios pg16+pgvector, redis7, langfuse, minio.
- **How**: imagen `pgvector/pgvector:pg16`. Healthchecks. Volúmenes nombrados.
- **Done when**: `docker compose up -d` levanta los 4 servicios y `psql` conecta.
- **Deps**: 1.
- **Parallel**: 2.

#### Step 4: CI pipeline básico
- **Why**: feedback temprano.
- **What**: `.github/workflows/ci.yml` con lint, typecheck, test, build.
- **How**: matrix Node 20; cache pnpm; `pnpm install --frozen-lockfile`.
- **Done when**: CI verde en PR vacía.
- **Deps**: 1.
- **Parallel**: 2, 3.

#### Step 5: ESLint + Prettier base + commit hooks
- **Why**: estilo consistente.
- **What**: configs raíz, `husky` + `lint-staged`.
- **Done when**: `pnpm lint` y `pnpm typecheck` corren.
- **Deps**: 1.

### FASE 1A — Núcleo + DB con todas las entidades (steps 6-22)

#### Step 6: Crear paquete `@wined/db`
- **What**: `packages/db/` con Drizzle, drizzle-kit, pg, postgres-js.
- **How**: `package.json` con scripts `migrate`, `push`; `drizzle.config.ts` apunta a `src/schema/index.ts` y `migrations/`.
- **Done when**: `pnpm --filter @wined/db build` OK.
- **Deps**: 1.

#### Step 7: Schema SQL inicial 0001_init.sql
- **What**: ejecutar el SQL §3.1 completo (organizations, users, memberships, workspaces, documents, document_chunks particionado, wine_catalog_global, conversations, messages, agent_invocations, evals_results, audit_log).
- **How**: copiar el bloque §3.1 a `infra/sql/0001_init.sql`; aplicar con `psql $DATABASE_URL -f`.
- **Done when**: `\dt` muestra las tablas; `SELECT count(*) FROM document_chunks_p0;` devuelve 0 OK.
- **Deps**: 6.

#### Step 8: Schema SQL 0002_curators.sql (corpus normativo + DO + conflicts + curator_runs)
- **How**: pegar §3.2.
- **Done when**: tablas existen; vector index OK.
- **Deps**: 7.
- **Parallel**: 9, 10, 11.

#### Step 9: Schema SQL 0003_cellar_entities.sql
- **How**: pegar §3.3 (vineyards, deposits, vintages, wine_lots, lot_operations, lab_analyses, grape_intakes, scheduled_operations).
- **Done when**: FKs verificadas; `EXPLAIN` sobre `idx_ops_lot_time` OK.
- **Deps**: 7.
- **Parallel**: 8, 10, 11.

#### Step 10: Schema SQL 0004_sommelier_entities.sql
- **How**: pegar §3.4 (wine_lists, wine_list_items, restaurant_guests, guest_orders, tasting_menus, dishes).
- **Deps**: 7.
- **Parallel**: 8, 9, 11.

#### Step 11: Schema SQL 0005_distributor.sql
- **How**: pegar §3.5 (distributor_catalogs, distributor_catalog_items, horeca_clients, commercial_sheets).
- **Deps**: 7.

#### Step 12: Schema SQL 0006_gdpr_and_feedback.sql + 0007_analytics.sql
- **How**: pegar §3.6 y §3.7 (user_memory, message_feedback, gdpr_export_jobs, analytics_events).
- **Deps**: 7.

#### Step 13: RLS policies (FORCE) en todas las tablas tenant-scoped
- **How**: pegar §3.8.
- **Done when**: SELECT sin `app.current_org` configurado devuelve 0 filas; con configurado devuelve solo la org.
- **Deps**: 8-12.

#### Step 14: Drizzle schemas TS espejo
- **What**: TS schemas en `packages/db/src/schema/*.ts` reflejando cada tabla.
- **How**: usar `pgTable` con tipos exactos (`uuid`, `text`, `timestamp`, `jsonb`, `integer`, `numeric`, vector custom type vía `customType<...>`).
- **Done when**: `drizzle-kit check` sin diff vs SQL.
- **Deps**: 13.

#### Step 15: Cliente DB + `withTenant` helper
- **How**: `packages/db/src/index.ts` exporta `createDb(connectionString)` y `withTenant` de §3.8.
- **Deps**: 14.

#### Step 16: Paquete `@wined/auth` (Clerk wrappers + tenant resolver)
- **What**: server middleware Hono que valida JWT, resuelve `organizations.clerk_org_id`, devuelve `AuthCtx { orgId, userId, role, product, outputLanguage }`.
- **How**: `clerkAuth()` Hono middleware; query org row; set `c.var.auth`.
- **Done when**: request sin token → 401; con token válido → 200 con orgId resuelto.
- **Deps**: 15.

#### Step 17: API Hono skeleton `apps/api`
- **What**: `apps/api/src/index.ts` con Hono app + `serve`; rutas `/health` y montaje de routers.
- **How**: TypeScript ESM; usa `@hono/node-server`.
- **Done when**: `pnpm --filter api dev` levanta en :8787.
- **Deps**: 16.

#### Step 18: Middleware stack (clerk → tenantGuard → rateLimit → disclaimer)
- **What**: `tenant-guard.ts` ejecuta `withTenant(c.var.auth.orgId, …)`. `rate-limit.ts` Redis token-bucket 60req/min, 200k tokens/min. `disclaimer.ts` añade flag `disclaimer_needed` si la sesión es nueva.
- **Deps**: 17.

#### Step 19: Paquete `@wined/embedding` con abstraction
- **What**: `provider.ts` (interface), `cohere.ts` (default dim=1024), `voyage.ts`, `openai.ts`.
- **How**: factory por env `EMBEDDING_PROVIDER`.
- **Done when**: `embed(['hola'])` devuelve `[number[1024]]`.
- **Deps**: 1.
- **Parallel**: 17, 18.

#### Step 20: Paquete `@wined/llm-gateway` base
- **What**: provider Anthropic SDK; `generate`, `stream`; Langfuse trace; semantic-cache Redis.
- **How**: pegar interfaces §6. Modelos: `claude-haiku-4`, `claude-sonnet-4`, `claude-opus-4`.
- **Done when**: smoke test devuelve texto y trazaId.
- **Deps**: 18.

#### Step 21: Citation gate runtime + source-tier ranking
- **What**: `citation-gate.ts` y `source-tier.ts` de §6 plug en `LLMGateway.generate`.
- **Done when**: agente technical sin citas → abstención automática; chunks re-rankeados.
- **Deps**: 20.

#### Step 22: `audit_log` write helper + endpoint admin filter
- **What**: helper `audit(action, entity, entityId, diff)` insertando con `c.var.auth`.
- **Deps**: 18.

### FASE 1B — Ingestion + parsers (steps 23-30)

#### Step 23: Object storage adapter (S3/R2 compatible)
- **What**: `packages/ingestion/src/storage.ts` con `put/get/sign`.
- **How**: AWS SDK v3 S3Client compatible con R2/Minio.
- **Deps**: 17.

#### Step 24: BullMQ queues + workers skeleton
- **What**: queues `ingestion:classify`, `ingestion:embed`, `curator:*`, `citation-validator`.
- **How**: `packages/ingestion/src/queues.ts`; workers en `apps/api/src/workers/`.
- **Deps**: 23.

#### Step 25: Parsers PDF/XLSX/DOCX/CSV/Image
- **What**: implementar `pdf.ts` (pdf-parse + Tesseract fallback con `eng+spa` → score `ocr_confidence`), `xlsx.ts` (SheetJS), `docx.ts` (mammoth), `csv.ts` (papaparse), `image-ocr.ts`. `audio.ts` lanza error placeholder.
- **Done when**: cada parser devuelve `{ text, blocks[], language?, confidence? }`.
- **Deps**: 24.

#### Step 26: OCR confidence + UI warning event
- **What**: si `ocr_confidence < 0.70`, emitir evento `document.ocr_low_confidence`, status='failed' con `meta.reason='low_ocr'`. UI muestra warning + opción de re-subir.
- **Deps**: 25.

#### Step 27: PII detector + consent gate bloqueante
- **What**: regex (DNI, email, teléfono ES) + un pase Sonnet sobre primeros 2k chars; si hits → `documents.status='quarantined_pii'` y `documents.pii_detected=true`. UI: `POST /v1/ingest/:id/pii-consent { decision: 'consent'|'redact'|'cancel' }`. Log obligatorio en `audit_log` (NUC-15).
- **Done when**: documento con PII queda bloqueado hasta decisión; decisión registrada en audit.
- **Deps**: 25.

#### Step 28: Extractor agent (Sonnet) por doc_type
- **What**: schemas Zod por tipo. **Fix ING-04**: schema `lab_report` con AV (volatile_acidity_g_l), SO₂ libre/total, unidades, rango DO → `out_of_range_flags`.
- **How**: prompt template por tipo en `packages/agents/src/ingestion/extractor.ts`.
- **Done when**: lab report → `lab_analyses` row con flags poblados.
- **Deps**: 25.

#### Step 29: Chunker + book-aware mode
- **What**: chunk size 700t / overlap 80; para `doc_type='book'` mantener `page_number` y `section_path`. ING-11.
- **Deps**: 25.

#### Step 30: Embedding worker + bulk insert
- **What**: consume `ingestion:embed`; llama `EmbeddingProvider.embed`; INSERT `document_chunks` con `source_tier='tenant_private'`.
- **Done when**: end-to-end: upload PDF carta → `documents.status='ready'` con chunks indexados.
- **Deps**: 19, 24, 29.

### FASE 1C — Curator Agents (steps 31-37)

#### Step 31: `@wined/curators` framework
- **What**: `curator.ts` con `run({trigger, orgId?})` que crea row en `curator_runs` y traza.
- **Deps**: 20.

#### Step 32: `regulation-curator` (Opus) seed inicial [BLOQUEA-CODIGO]
- **Why**: corpus normativo es prerrequisito de vertical cellar.
- **What**: ingestar EUR-Lex Reg. UE 1308/2013, 2019/934; resoluciones OIV §2.1.18 (SO₂), §3.x (acidez); BOE seleccionados.
- **How**: lista de URLs en `packages/curators/src/sources.json`. Fetcher → parse HTML/PDF → prompt Opus produce JSON `RegulationArticleSchema` → INSERT `regulatory_corpus` + embeddings. Dedupe por `(reg_code, article_ref)`. `supersedes_id` cuando aplique.
- **System prompt**: ver §5.3.
- **Done when**: `SELECT count(*) FROM regulatory_corpus WHERE source IN ('EUR-Lex','OIV')` ≥ 50.
- **[BLOQUEA-CODIGO]**: humano valida lista de fuentes seed.
- **Deps**: 31.

#### Step 33: `do-curator` — pliegos de DOs ES [BLOQUEA-CODIGO]
- **What**: cargar 70 DOs/IGPs ES (CSV inicial con `code`, `name`, `council_url`, `pliego_pdf_url`). Curator descarga pliego, lo ingesta como documento global, extrae reglas (variedades permitidas, rendimientos, prácticas, etiquetado) → `do_rules`.
- **[BLOQUEA-CODIGO]**: humano confirma primer set de 5 DOs prioritarias (Rioja, Ribera, Cava, Rías Baixas, Jerez) para pilotar.
- **Done when**: 5 DOs tienen ≥10 `do_rules` con `citation_id` válido a `regulatory_corpus`.
- **Deps**: 32.

#### Step 34: `book-curator` (tenant-scope)
- **What**: cuando un tenant sube `doc_type='book'`, este curator hace chunking book-aware (capítulo/sección/página) y persiste `document_chunks` con `source_tier='tenant_private'` + `page_number`.
- **Done when**: subida de Peynaud test PDF produce chunks citables por página.
- **Deps**: 29, 31.

#### Step 35: `catalog-curator` — Vivino/Wine-Searcher via Apify
- **What**: Apify actor scrapea Vivino; output JSON; curator deduplica (productor + nombre + añada), normaliza variedades/DO, INSERT `wine_catalog_global`.
- **Riesgo**: ToS Vivino — aceptado por usuario.
- **Done when**: ≥1.000 vinos top ES + 1.000 internacionales cargados.
- **Deps**: 31.

#### Step 36: `corpus-reviewer` (Opus) — cron semanal
- **What**: workflow que selecciona regs ingestadas en últimos 7d + chunks tenant relevantes; Opus detecta conflictos; escribe `corpus_conflicts` con `resolution_tier`. Marca chunks obsoletos.
- **How**: GitHub Actions cron `0 3 * * 1`; `pnpm curators:run -- corpus-reviewer`.
- **Done when**: primer run produce ≥1 conflicto demo y queda en `corpus_conflicts`.
- **Deps**: 32, 35.

#### Step 37: Curator endpoints + admin UI trigger
- **What**: `POST /v1/admin/curate/:name` (`regulation|do|book|catalog|reviewer`) ejecuta on-demand. Admin role required. Status visible vía `GET /v1/admin/curator-runs`.
- **Deps**: 31.

### FASE 2A — Sommelier-web MVP (steps 38-50)

#### Step 38: Scaffold `apps/sommelier-web` (Next.js 14)
- **What**: App Router, Tailwind, shadcn, Clerk provider; routing `(auth)/sign-in/up`, `(app)/dashboard/chat/library/inventory/guests/menus`.
- **Deps**: 16.

#### Step 39: Pairing agent + tool `search_wine_list` + chat UI
- **What**: agente §5.3 + tool que consulta `wine_list_items WHERE list.is_active AND in_stock`. Chat SSE.
- **Done when**: pregunta "maridaje para solomillo a la pimienta <40€" devuelve 3 vinos de la carta activa con justificación.
- **Deps**: 20, 21, 30.

#### Step 40: Wine list parser → `wine_lists` + `wine_list_items` (SOM-01, SOM-15)
- **What**: extractor especializado para `doc_type='wine_list'`; persiste lista con `version` y `is_active=true` (deactivando anteriores del mismo workspace).
- **Done when**: subida PDF de 200 refs → 200 `wine_list_items` en <5 min.
- **Deps**: 28.

#### Step 41: Service mode toggle + agent variant (SOM-05)
- **What**: toggle en UI; `conversations.service_mode=true` selecciona `service-mode` agent con prompt `<40 words`.
- **Deps**: 39.

#### Step 42: Guest memory entity + agent + UI (SOM-06, SOM-07)
- **What**: CRUD `restaurant_guests` + `guest_orders` con consent flow PII. Resumen al entrar (last orders + preferences). Agent `guest-memory` con tools.
- **Done when**: crear guest, registrar 2 pedidos, preguntar "¿qué pidió la última vez?" responde correctamente.
- **Deps**: 27, 38.

#### Step 43: NL2query inventory (SOM-16)
- **What**: agent `inventory` traduce "blancos atlánticos < 40€" a SQL parametrizado seguro sobre `wine_list_items`.
- **Deps**: 39.

#### Step 44: Translation ES↔EN de carta + glosario (SOM-08)
- **What**: glosario controlado `packages/wine-kb/src/glossary.ts` (DO, crianza, etc.). Endpoint `POST /v1/wine-lists/:id/translate?lang=en`. Export PDF EN via `pdf-export`.
- **Deps**: 40.

#### Step 45: Canvas lateral con ficha + mapa + nota (SOM-04)
- **What**: panel lateral cuando agente cita un vino: ficha técnica de KB tenant o `wine_catalog_global`, mini-mapa region (SVG estático por DO), tasting note.
- **Deps**: 39.

#### Step 46: Multi-establecimiento UI + permisos cross-hotel (SOM-09)
- **What**: selector workspace; `memberships.workspace_scope` enforced en queries; reporting cross-hotel (cuentas por workspace).
- **Deps**: 38, 42.

#### Step 47: Versionado carta + selector activa (SOM-15)
- **What**: UI lista versiones; botón "set active" toggles unique constraint.
- **Deps**: 40.

#### Step 48: Tasting menu ingestion + dishes (SOM-21)
- **What**: doc_type `menu` → extractor produce `tasting_menus` + `dishes` con descriptores. Linker dish→pairings.
- **Deps**: 40.

#### Step 49: Bilingual citation formatter (I-1, NUC-05)
- **What**: utility que toma cita en idioma X y `outputLanguage` Y: si X≠Y devuelve `"<original>" — traducción: "<translation>"`. Inyectado en respuesta del gateway.
- **Deps**: 21.

#### Step 50: Sommelier onboarding wizard (SOM-10, §7.1)
- **What**: 7 pasos exactos del SPEC §7.1; estado persistido en `organizations.onboarding_state`; reanudable (Edge 20); email recordatorio cron D3.
- **How**: máquina de estados; cada paso emite `onboarding.step_completed` con `step_name`.
- **Done when**: time-to-first-value ≤ 15 min (medido en PostHog).
- **Deps**: 38, 40.

### FASE 2B — Cellar-web MVP (steps 51-63)

#### Step 51: Scaffold `apps/cellar-web`
- **Deps**: 16.
- **Parallel**: 38.

#### Step 52: Cellar entities CRUD APIs (lots, deposits, vineyards, vintages)
- **What**: REST endpoints + UI básicos.
- **Deps**: 14, 17.

#### Step 53: Grape intakes form + alerts (CEL-11, CEL-12)
- **What**: form rápido; comparar con histórico finca (z-score sobre `grape_intakes` previos del mismo vineyard) → `out_of_historical_flags`.
- **Deps**: 52.

#### Step 54: Lot operations timeline UI (CEL-06)
- **What**: vista timeline por lot leyendo `lot_operations`.
- **Deps**: 52.

#### Step 55: Lab analysis ingestion → asociación a lote + flags (CEL-08)
- **What**: extractor lab_report (Step 28) crea `lab_analyses` linked a `lot_id` (resuelto por código de lote en PDF o selector manual). Flags rango DO.
- **Deps**: 28, 52.

#### Step 56: Calc tools completas (CEL-02, CEL-03, CEL-04, CEL-05)
- **What**: en `packages/agents/src/cellar/calc.ts`:
  - `so2_active_dose({so2_free_target_mg_l, ph, alcohol_pct})` → `{dose_g_hl, salt:'K2S2O5', citation:'reg-ue-2019-934-anexo-i-b'}`
  - `acidity_adjustment({current_at_g_l, target_at_g_l, volume_l, acid:'tartaric'|'malic'|'lactic'})`
  - `clarifier_dose({clarifier:'bentonite'|'gelatin'|'casein', test_result, volume_l})`
  - `baume_brix_abv({input, kind})` con curva OIV
  - Cada tool inyecta `citation_id` resuelto vía `lookupRegulation`.
- **Done when**: pregunta SO₂ devuelve dosis + cita Reg UE 2019/934.
- **Deps**: 32, 21.

#### Step 57: Enology agent (technical=true) (CEL-01, CEL-14)
- **What**: agente §5.3 con RAG sobre `regulatory_corpus` + books. Citation gate enforced.
- **Done when**: query "límite SO₂ tinto seco UE" devuelve cita Reg 2019/934 Anexo I Parte B.
- **Deps**: 32, 21.

#### Step 58: Compliance agent + `lookup_do_rule` (CEL-09)
- **What**: tool consulta `do_rules` por `do_code`.
- **Done when**: "¿esto permitido en DO Rioja?" devuelve regla con cita.
- **Deps**: 33.

#### Step 59: Anomaly detection (CEL-07)
- **What**: agente `anomaly` consume últimas N filas `lab_analyses` + `lot_operations`; reglas heurísticas + razonamiento Sonnet.
- **Deps**: 55.

#### Step 60: Scheduled operations calendar (CEL-15)
- **What**: vista calendario + recordatorios email; CRUD `scheduled_operations`.
- **Deps**: 52.

#### Step 61: Compare vintages (CEL-18)
- **What**: tool `compare_vintages({vintage_a, vintage_b})` agrega lab_analyses+intakes y devuelve tabla.
- **Deps**: 55.

#### Step 62: "Show your work" UI (CEL-23)
- **What**: cada respuesta technical muestra panel con tools usadas, chunks recuperados, chunks descartados (vía `agent_invocations.retrieved_chunks`).
- **Deps**: 57.

#### Step 63: Cellar onboarding wizard (CEL-20, §7.2)
- **What**: 7 pasos del SPEC; crea lote demo; carga pliego DO seleccionada en corpus accesible; primera pregunta SO₂ con cita.
- **Done when**: time-to-first-cited-answer ≤ 15 min.
- **Deps**: 51, 56, 57.

### FASE 2C — Distributor-web MVP (steps 64-72)

#### Step 64: Scaffold `apps/distributor-web`
- **What**: similar a sommelier-web; routing `dashboard/catalog/clients/sheets/chat`.
- **Deps**: 16.
- **Parallel**: 38, 51.

#### Step 65: Distributor catalog ingestion (Excel/CSV masivo)
- **What**: pipeline grande (10k+ refs). Cola visible; email al completar (Edge 17). Mapeo de columnas asistido.
- **Deps**: 25.

#### Step 66: `catalog-nl` agent + NL2query distribuidor (SOM-17)
- **What**: search sobre `distributor_catalog_items` con filtros stock/precio/DO/perfil.
- **Deps**: 65.

#### Step 67: HoReCa clients CRUD
- **Deps**: 64.

#### Step 68: Commercial sheet generator (SOM-18)
- **What**: agent `commercial-sheet` produce payload JSON; `packages/pdf-export/src/commercial-sheet.ts` renderiza PDF brandeado con citas técnicas verificables (referencias a `regulatory_corpus`).
- **Done when**: `POST /v1/distributor/sheets` devuelve PDF URL firmada.
- **Deps**: 66, 32.

#### Step 69: Distributor onboarding wizard (§7.3)
- **What**: 6 pasos del SPEC §7.3; subida masiva → mapeo → búsqueda prueba → ficha demo.
- **Deps**: 64, 65, 68.

#### Step 70: Distributor product enum + product gating
- **What**: en signup, si selecciona "Distribuidor", set `organizations.product='distributor'`; middleware redirige a `apps/distributor-web`.
- **Deps**: 64.

#### Step 71: Stock & price import UI
- **What**: re-upload diferencial; merge por SKU.
- **Deps**: 65.

#### Step 72: Sales report ingestion + rotation analysis (SOM-13)
- **What**: doc_type `sales_report` → extractor → agregado por wine_list/distributor_catalog_item; tool `rotation_analysis`.
- **Deps**: 28, 40.

### FASE 3 — GDPR + analytics + observabilidad + cross-cutting (steps 73-83)

#### Step 73: User memory CRUD + agent integration (NUC-03)
- **What**: endpoints `GET/PUT/DELETE /v1/me/memory`; agentes inyectan `user_memory` activo en system prompt.
- **Deps**: 18.

#### Step 74: Message feedback API + dashboard (NUC-14)
- **What**: `POST /v1/messages/:id/feedback {rating, reason, comment}`; admin dashboard agrega tasa 👍.
- **Deps**: 18.

#### Step 75: GDPR endpoints (NUC-09, Edge 13)
- **What**:
  - `POST /v1/me/export` → enqueue job; produce ZIP con `documents/`, `messages.json`, `user_memory.json`, `feedback.json`. URL firmada expira 7d.
  - `DELETE /v1/orgs/:id` → soft delete; `organizations.status='pending_delete'`, `hard_delete_at=now()+30d`. Cron diario ejecuta hard-delete con `ON DELETE CASCADE`.
  - `DELETE /v1/me/memory` y `DELETE /v1/me/memory/:id`.
- **Done when**: usuario solicita export → recibe ZIP válido en <10min para tenant medio.
- **Deps**: 18, 73.

#### Step 76: Disclaimer middleware (NUC-16)
- **What**: si `conversations.disclaimer_shown=false`, primer chunk SSE inyecta "Soy un asistente IA…"; toggle `disclaimer_shown=true`.
- **Deps**: 18.

#### Step 77: Conflict resolution KB privada vs global (NUC-13)
- **What**: setting `organizations.kb_preference`; `source-tier.ts` y RAG ranker lo respetan; UI muestra flag visible cuando hay conflicto ("según tu KB: X | según OIV: Y").
- **Deps**: 21.

#### Step 78: Guardrails legales/médicos/comerciales (Edge 12, 19, NUC-16)
- **What**: classifier ligero pre-router (Haiku) detecta intents `medical/legal/financial/comparative_subjective` → respuesta de redirección. System prompts cellar/sommelier incluyen regla anti-opinión comercial.
- **Deps**: 20.

#### Step 79: Cita rota detection cron (Edge 16)
- **What**: worker `citation-validator` consume diariamente messages con `citations`, verifica que `doc_id` siga existiendo activo; si no → `messages.obsolete_reason='broken_citation'`. UI muestra badge.
- **Deps**: 21.

#### Step 80: Analytics (PostHog) — eventos + funnels + cohorts + NPS + cost dashboards
- **What**: `packages/analytics` emite todos los eventos §7.2; cron sincroniza `analytics_events.posthog_synced=false`. Pipelines WAU/MAU/NPS/cost-per-user.
- **Deps**: 18.

#### Step 81: Hallucination loop (👎 → revision)
- **What**: feedback `rating=-1, reason='hallucination'` crea row en `corpus_conflicts` para revisión; UI cola admin.
- **Deps**: 74.

#### Step 82: NL2query full-text search en chat histórico (NUC-11)
- **What**: endpoint `GET /v1/conversations/search?q=` usando `idx_msg_fts` + similitud sobre `document_chunks`.
- **Deps**: 14.

#### Step 83: Resumable onboarding + recordatorio email D3 (Edge 20)
- **What**: cron que envía email si `onboarding_state.completed_at IS NULL AND created_at < now()-3d`.
- **Deps**: 50, 63, 69.

---

## 9. Paralelización

| Bloque | Steps que corren en paralelo | Razón |
|---|---|---|
| Setup | 2, 3, 4, 5 | Independientes tras 1 |
| Schema | 8, 9, 10, 11, 12 | Distintas tablas tras 7 |
| Pods front | 38 (sommelier-web), 51 (cellar-web), 64 (distributor-web) | Apps separadas |
| Curators | 32, 33, 34, 35 después de 31 | Datos disjuntos |
| Verticales completos | Fase 2A (38-50), 2B (51-63), 2C (64-72) | Pueden avanzar 3 verticales en paralelo tras Fase 1C |
| Cross-cutting | 73-83 paralelos entre sí | Tablas distintas, mismo middleware base |

---

## 10. Riesgos clave (actualizados)

| # | Riesgo | Impacto | Mitigación |
|---|---|---|---|
| R1 | Coste de Opus en curators (regulation + reviewer) | Alto | Curators NO real-time; cron + batch; cache de URLs ya parseadas; budget cap `OPUS_MAX_TOKENS_PER_RUN`; reviewer sólo sobre delta semanal. |
| R2 | ToS Vivino / Apify (catalog-curator) | Legal | Aceptado por usuario; aislar en módulo retirable; fallback: catálogo manual + Wine-Searcher con API licenciada. |
| R3 | Corpus normativo incompleto en MVP | Bloquea cellar | Lista seed mínima (Reg UE 1308/2013, 2019/934, OIV §2.1.18, 5 DOs prioritarias) [BLOQUEA-CODIGO Step 32, 33]. |
| R4 | Libros técnicos copyright | Legal | NO licenciamos; tenant sube su copia; `source_tier='tenant_private'`; not shared cross-tenant. |
| R5 | Hallucination en cellar | Reputacional | Citation gate runtime (Step 21) + abstención + eval offline ≥80% con jurado. |
| R6 | PII clientes restaurante | GDPR | Consent gate bloqueante (Step 27) + audit_log + `email_hash`. |
| R7 | Switching cost cliente vs portabilidad | Confianza | Export GDPR Art.20 siempre disponible (Step 75). |
| R8 | Vector dim atada a Cohere | Migración futura | EmbeddingProvider abstraction (Step 19); migración offline si se cambia. |
| R9 | Multi-tenant leak | Compliance | RLS FORCE en todas las tablas tenant + tests automatizados de aislamiento. |
| R10 | Onboarding wizard interrumpido | Conversion | Estado persistido + recordatorio D3 (Step 83). |
| R11 | Coste LLM por usuario fuera de presupuesto | Margen | Cache 0.93, model fallback Sonnet→Haiku para non-technical; dashboard cost/user (Step 80). |

---

## 11. Coste estimado

Supuestos: 100 tenants pilot, ~5 usuarios activos/tenant = 500 MAU; 30 conv/usuario/mes; promedio 6 turns/conv; 80% Haiku router + 20% Sonnet specialist + 1% Opus curator.

| Concepto | Volumen mes | Coste estimado |
|---|---|---|
| Anthropic Haiku (router + non-technical) | ~600M tokens in/out mix | ~$450 |
| Anthropic Sonnet (specialists) | ~150M tokens | ~$1.500 |
| Anthropic Opus (curators batch) | ~10M tokens | ~$300 |
| Cohere embeddings (ingestion + queries) | ~500M tokens | ~$50 |
| Postgres (Neon/Supabase) | ~50GB + 16 partitions | ~$200 |
| Redis (Upstash) | semantic cache | ~$50 |
| S3/R2 (documentos + ZIPs export) | ~500GB | ~$30 |
| Fly.io (api + workers) | 3 machines | ~$80 |
| Vercel (3 web apps) | hobby/pro | ~$60 |
| Langfuse + PostHog | self-host + cloud | ~$150 |
| Apify (catalog scraping) | runs mensuales | ~$100 |
| **Total infra+LLM/mes** | | **~$2.970** |
| **Por usuario activo/mes** | 500 MAU | **~$5,94/usuario** ✅ (<8€ target) |

---

## Resumen del cambio

- **Steps**: 83 (vs ~56 anterior) — +27 nuevos.
- **Tablas**: 30 (vs 13 anterior) — entidades cellar/sommelier/distributor first-class + curator + GDPR + analytics + corpus normativo.
- **Agentes**: 22 (vs ~12 anterior) — añadido pod Curator (5 agentes), pod Distributor (2 agentes), service-mode y menu en sommelier, lab-analysis en cellar.
- **Apps**: 3 (sommelier-web + cellar-web + distributor-web) vs 2.
- **Packages nuevos**: `embedding` (abstraction), `curators`, `analytics`, `pdf-export`.

### Cambios principales vs PLAN anterior

1. **Curator Pod añadido** con 5 agentes (regulation/do/book/catalog/reviewer) y tablas `regulatory_corpus`, `do_rules`, `corpus_conflicts`, `curator_runs`.
2. **Entidades de dominio sacadas de JSONB** (`tenant_kb` queda solo para preferencias sueltas). Cellar/Sommelier/Distributor tienen tablas relacionales.
3. **Citation gate runtime** + source-tier ranking + abstención obligatoria.
4. **Distributor como vertical first-class** con app propia y onboarding §7.3.
5. **GDPR completo**: export ZIP, soft+hard delete, user_memory CRUD.
6. **Feedback loop** (`message_feedback`) + observabilidad de producto (PostHog).
7. **EmbeddingProvider abstraction** para no atarse a Cohere.
8. **Audio difered** Fase 2, idiomas regionales diferidos, plan único pilot.

### Top 3 riesgos nuevos

1. **Coste Opus en curators** — mitigado con cron+batch y budget cap.
2. **Dependencia legal/ToS de Vivino** vía Apify — aceptado por usuario; aislado en módulo retirable.
3. **Corpus normativo incompleto** sin decisión humana sobre fuentes seed — marcado `[BLOQUEA-CODIGO]` en Steps 32 y 33.

---

**Status**: success
**Summary**: PLAN.md v2.0 regenerado desde cero. 83 steps en 8 fases, 30 tablas, 22 agentes incluyendo Curator Pod, vertical Distributor first-class, GDPR completo, citation gate runtime, EmbeddingProvider abstraction. Difiere explícitamente audio, idiomas regionales, tiering y POS/ERP.
**Artifacts**: `/Users/adrianaybar/Downloads/role-play-clasing/.claude/worktrees/suspicious-pasteur-cbfd64/wine-app/PLAN.md`
**Next**: humano resuelve los dos puntos `[BLOQUEA-CODIGO]` (Step 32 sources seed, Step 33 5 DOs prioritarias) antes de pasar el plan al coder.
**Risks**: coste Opus curators, ToS Vivino, corpus seed pendiente de input humano.
**skill_resolution**: none
