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
