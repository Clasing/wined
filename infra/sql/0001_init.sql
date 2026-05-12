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
