-- 0008_rls.sql — Row-Level Security (FORCE) on tenant-scoped tables.
-- Source: PLAN.md §3.8 (verbatim list of tables). Two minimal deltas vs §3.8:
--   1. `tenant_kb` is skipped if it does not exist in the schema (table is listed
--      in §3.8 but never created by migrations 0001-0007).
--   2. `organizations` uses `id` (its own PK) instead of `organization_id`, since
--      the org row IS the tenant. All other tables use `organization_id`.
-- Globals NOT tenant-scoped → no RLS:
--   users, wine_catalog_global, denominations_of_origin, do_rules,
--   corpus_conflicts, curator_runs, regulatory_corpus, evals_results.

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
    'user_memory','message_feedback','gdpr_export_jobs','analytics_events',
    'memberships'
  ]
  LOOP
    -- Skip tables that do not exist (e.g. tenant_kb not yet created).
    IF to_regclass('public.' || quote_ident(t)) IS NULL THEN
      RAISE NOTICE 'Skipping RLS for missing table: %', t;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);

    -- Drop any pre-existing policy with the same name so this migration is idempotent.
    EXECUTE format('DROP POLICY IF EXISTS org_iso_%1$s ON %1$I;', t);

    IF t = 'organizations' THEN
      -- The org row IS the tenant: match on its own id.
      EXECUTE format($p$
        CREATE POLICY org_iso_%1$s ON %1$I
          USING (id::text = current_setting('app.current_org', true));
      $p$, t);
    ELSE
      EXECUTE format($p$
        CREATE POLICY org_iso_%1$s ON %1$I
          USING (organization_id::text = current_setting('app.current_org', true));
      $p$, t);
    END IF;
  END LOOP;
END$$;

-- Note: regulatory_corpus, denominations_of_origin, do_rules, corpus_conflicts,
-- wine_catalog_global, curator_runs are NOT tenant-scoped → no RLS.
