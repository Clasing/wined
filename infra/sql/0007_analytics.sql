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
