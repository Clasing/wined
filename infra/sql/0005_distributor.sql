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
