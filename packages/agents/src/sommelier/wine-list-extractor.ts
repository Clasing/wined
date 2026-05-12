import { and, desc, eq } from 'drizzle-orm';
import type { LLMGateway } from '@wined/llm-gateway';
import { wineLists, wineListItems, type DbTx } from '@wined/db';
import { runExtractor } from '../ingestion/extractor.js';

/**
 * Specialized wine_list ingester.
 *
 * Runs the generic Sonnet extractor on a raw document text, then
 * persists the structured result into `wine_lists` + `wine_list_items`,
 * versioning the list (next int after max version for the same workspace)
 * and toggling `is_active` so only the new version stays active.
 *
 * The `tx` must already be a tenant-scoped Drizzle transaction
 * (`withTenant`), so RLS sees `app.current_org` set correctly.
 */
export type IngestWineListOptions = {
  tx: DbTx;
  gateway: LLMGateway;
  orgId: string;
  workspaceId: string;
  sourceDocId: string;
  documentText: string;
};

export type IngestWineListResult = {
  listId: string;
  version: number;
  itemsInserted: number;
};

export async function ingestWineList(
  opts: IngestWineListOptions,
): Promise<IngestWineListResult> {
  // 1. Extract via Sonnet
  const extracted = await runExtractor(opts.gateway, {
    docType: 'wine_list',
    documentText: opts.documentText,
    tenantId: opts.orgId,
  });

  // 2. Deactivate previous active list in same workspace
  await opts.tx
    .update(wineLists)
    .set({ isActive: false })
    .where(
      and(
        eq(wineLists.organizationId, opts.orgId),
        eq(wineLists.workspaceId, opts.workspaceId),
        eq(wineLists.isActive, true),
      ),
    );

  // 3. Determine next version
  const prevRows = await opts.tx
    .select({ v: wineLists.version })
    .from(wineLists)
    .where(
      and(
        eq(wineLists.organizationId, opts.orgId),
        eq(wineLists.workspaceId, opts.workspaceId),
      ),
    )
    .orderBy(desc(wineLists.version))
    .limit(1);
  const prevVersion = prevRows[0]?.v ?? 0;
  const nextVersion = prevVersion + 1;

  // 4. Insert new list
  const inserted = await opts.tx
    .insert(wineLists)
    .values({
      organizationId: opts.orgId,
      workspaceId: opts.workspaceId,
      name: extracted.list_name ?? 'Carta',
      version: nextVersion,
      isActive: true,
      sourceDocId: opts.sourceDocId,
    })
    .returning({ id: wineLists.id });
  const listRow = inserted[0];
  if (!listRow) {
    throw new Error('failed to insert wine_lists row');
  }
  const listId = listRow.id;

  // 5. Insert items in batches of 500
  const rows = extracted.items.map((it) => ({
    organizationId: opts.orgId,
    listId,
    displayName: it.name,
    producer: it.producer,
    vintage: it.vintage,
    doAppellation: it.denomination,
    wineType: it.type,
    priceEur: it.price_eur !== null ? String(it.price_eur) : null,
    stock: it.stock ?? 0,
  }));

  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    if (slice.length > 0) {
      await opts.tx.insert(wineListItems).values(slice);
    }
  }

  return { listId, version: nextVersion, itemsInserted: rows.length };
}
