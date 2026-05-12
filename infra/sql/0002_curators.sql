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
