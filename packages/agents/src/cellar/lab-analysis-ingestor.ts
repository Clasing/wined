import { and, eq } from 'drizzle-orm';
import type { LLMGateway } from '@wined/llm-gateway';
import { labAnalyses, wineLots, type DbTx } from '@wined/db';
import { runExtractor } from '../ingestion/extractor.js';

/**
 * Lab-analysis ingester (Step 55, CEL-08).
 *
 * Runs the generic Sonnet extractor on a raw lab_report document text, then
 * persists the structured result into `lab_analyses`. Resolves `lot_id` from
 * an explicit caller-provided id, or by matching the `wine_lot_ref` extracted
 * from the document against `wine_lots.code` within the tenant.
 *
 * The `tx` must already be a tenant-scoped Drizzle transaction (`withTenant`),
 * so RLS sees `app.current_org` set correctly.
 */
export type IngestLabAnalysisOptions = {
  tx: DbTx;
  gateway: LLMGateway;
  orgId: string;
  documentText: string;
  /** Optional explicit linking; else extractor may detect via `wine_lot_ref`. */
  lotId?: string;
  /** Optional source document id to persist alongside the analysis. */
  documentId?: string;
};

export type IngestLabAnalysisResult = {
  analysisId: string;
  lotMatched: boolean;
  flags: number;
};

export async function ingestLabAnalysis(
  opts: IngestLabAnalysisOptions,
): Promise<IngestLabAnalysisResult> {
  const extracted = await runExtractor(opts.gateway, {
    docType: 'lab_report',
    documentText: opts.documentText,
    tenantId: opts.orgId,
  });

  // Resolve lot by wine_lot_ref if explicit lotId not given
  let resolvedLotId: string | null = opts.lotId ?? null;
  if (!resolvedLotId && extracted.wine_lot_ref) {
    const found = await opts.tx
      .select({ id: wineLots.id })
      .from(wineLots)
      .where(
        and(
          eq(wineLots.organizationId, opts.orgId),
          eq(wineLots.code, extracted.wine_lot_ref),
        ),
      )
      .limit(1);
    const hit = found[0];
    if (hit) resolvedLotId = hit.id;
  }

  const sampledAt = extracted.sample_date
    ? new Date(extracted.sample_date)
    : new Date();

  // Map extractor output → schema columns. Fields not present in the table
  // schema (e.g. malolactic_done, units) are preserved in `raw` jsonb.
  const flags = extracted.out_of_range_flags ?? [];

  const values = {
    organizationId: opts.orgId,
    lotId: resolvedLotId,
    ...(opts.documentId ? { documentId: opts.documentId } : {}),
    sampledAt,
    alcoholPct:
      extracted.alcohol_pct_vol !== null && extracted.alcohol_pct_vol !== undefined
        ? String(extracted.alcohol_pct_vol)
        : null,
    ph:
      extracted.ph !== null && extracted.ph !== undefined
        ? String(extracted.ph)
        : null,
    totalAcidityGL:
      extracted.total_acidity_g_l !== null && extracted.total_acidity_g_l !== undefined
        ? String(extracted.total_acidity_g_l)
        : null,
    volatileAcidityGL:
      extracted.volatile_acidity_g_l !== null && extracted.volatile_acidity_g_l !== undefined
        ? String(extracted.volatile_acidity_g_l)
        : null,
    so2FreeMgL:
      extracted.so2_free_mg_l !== null && extracted.so2_free_mg_l !== undefined
        ? String(extracted.so2_free_mg_l)
        : null,
    so2TotalMgL:
      extracted.so2_total_mg_l !== null && extracted.so2_total_mg_l !== undefined
        ? String(extracted.so2_total_mg_l)
        : null,
    residualSugarGL:
      extracted.residual_sugar_g_l !== null && extracted.residual_sugar_g_l !== undefined
        ? String(extracted.residual_sugar_g_l)
        : null,
    outOfRangeFlags: flags,
    raw: {
      malolactic_done: extracted.malolactic_done ?? null,
      units: extracted.units ?? null,
      notes: extracted.notes ?? null,
      wine_lot_ref: extracted.wine_lot_ref ?? null,
    },
  };

  const inserted = await opts.tx
    .insert(labAnalyses)
    .values(values)
    .returning({ id: labAnalyses.id });
  const row = inserted[0];
  if (!row) {
    throw new Error('failed to insert lab_analyses row');
  }

  return {
    analysisId: row.id,
    lotMatched: resolvedLotId !== null,
    flags: flags.length,
  };
}
