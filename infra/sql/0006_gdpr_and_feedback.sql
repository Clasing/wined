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
