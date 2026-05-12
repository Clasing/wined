import type { LLMGateway } from '@wined/llm-gateway';
import { dishes, tastingMenus, type DbTx } from '@wined/db';
import { runExtractor } from '../ingestion/extractor.js';

/**
 * Specialized tasting_menu ingester (SOM-21).
 *
 * Runs the generic Sonnet extractor on a raw menu document text, then
 * persists the structured result into `tasting_menus` + `dishes`.
 *
 * The `tx` must already be a tenant-scoped Drizzle transaction
 * (`withTenant`), so RLS sees `app.current_org` set correctly.
 */
export type IngestTastingMenuOptions = {
  tx: DbTx;
  gateway: LLMGateway;
  orgId: string;
  workspaceId: string;
  sourceDocId: string;
  documentText: string;
};

export type IngestTastingMenuResult = {
  menuId: string;
  dishesInserted: number;
};

export async function ingestTastingMenu(
  opts: IngestTastingMenuOptions,
): Promise<IngestTastingMenuResult> {
  // 1. Extract via Sonnet
  const extracted = await runExtractor(opts.gateway, {
    docType: 'menu',
    documentText: opts.documentText,
    tenantId: opts.orgId,
  });

  // 2. Insert tasting menu
  const inserted = await opts.tx
    .insert(tastingMenus)
    .values({
      organizationId: opts.orgId,
      workspaceId: opts.workspaceId,
      name: extracted.menu_name ?? 'Menú degustación',
      sourceDocId: opts.sourceDocId,
      isActive: true,
    })
    .returning({ id: tastingMenus.id });
  const menuRow = inserted[0];
  if (!menuRow) {
    throw new Error('failed to insert tasting_menus row');
  }
  const menuId = menuRow.id;

  // 3. Insert dishes in bulk
  const dishRows = extracted.dishes.map((d, idx) => ({
    organizationId: opts.orgId,
    menuId,
    name: d.name,
    description: d.description,
    courseOrder: idx,
    descriptors: {
      course: d.course ?? null,
      ingredients: d.ingredients ?? [],
      allergens: d.allergens ?? [],
    },
  }));

  if (dishRows.length > 0) {
    await opts.tx.insert(dishes).values(dishRows);
  }

  return { menuId, dishesInserted: dishRows.length };
}
