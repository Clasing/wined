CREATE TABLE IF NOT EXISTS sales_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_doc_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  period_start date,
  period_end date,
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_reports_org ON sales_reports(organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS sales_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sales_report_id uuid REFERENCES sales_reports(id) ON DELETE CASCADE,
  wine_list_item_id uuid REFERENCES wine_list_items(id) ON DELETE SET NULL,
  distributor_catalog_item_id uuid REFERENCES distributor_catalog_items(id) ON DELETE SET NULL,
  reference_label text,
  sold_at date,
  quantity numeric,
  revenue_eur numeric,
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_records_org_date ON sales_records(organization_id, sold_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_records_wli ON sales_records(wine_list_item_id);
CREATE INDEX IF NOT EXISTS idx_sales_records_dci ON sales_records(distributor_catalog_item_id);

ALTER TABLE sales_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_reports FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_sales_reports ON sales_reports;
CREATE POLICY tenant_isolation_sales_reports ON sales_reports USING (organization_id::text = current_setting('app.current_org', true));

ALTER TABLE sales_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_records FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_sales_records ON sales_records;
CREATE POLICY tenant_isolation_sales_records ON sales_records USING (organization_id::text = current_setting('app.current_org', true));
