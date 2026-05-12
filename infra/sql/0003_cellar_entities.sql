-- 0003_cellar_entities.sql
-- Cellar domain first-class entities (PLAN.md §3.3)

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
