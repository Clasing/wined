import { z } from 'zod';
import type { AgentContext, AgentDef, Tool } from '../framework/agent.js';

const GenInputSchema = z
  .object({
    catalog_item_id: z.string().uuid().optional(),
    global_wine_id: z.string().uuid().optional(),
    generated_for: z.string().optional(),
  })
  .refine((v) => v.catalog_item_id !== undefined || v.global_wine_id !== undefined, {
    message: 'Provide catalog_item_id or global_wine_id',
  });

export type GenCommercialSheetInput = z.infer<typeof GenInputSchema>;

export type CommercialSheetWine = {
  producer: string;
  name: string;
  vintage?: number | null;
  doAppellation?: string | null;
  region?: string | null;
  wineType?: string;
  grapeVarieties?: string[];
};

export type GenCommercialSheetSuccess = {
  brand: { name: string; logoText?: string };
  wine: CommercialSheetWine;
  citations: Array<{ id: string; label: string; body: string }>;
  generatedAt: string;
  generatedFor?: string;
};

export type GenCommercialSheetResult =
  | GenCommercialSheetSuccess
  | { error: string };

export const genCommercialSheetPayloadTool: Tool<
  GenCommercialSheetInput,
  GenCommercialSheetResult
> = {
  name: 'gen_commercial_sheet_payload',
  description:
    'Build the JSON payload for a commercial sheet PDF from a distributor catalog item OR a global wine. Returns brand, wine fields, and an empty citations array (citations are added by the agent after rag_search).',
  input: GenInputSchema,
  handler: async (
    input: GenCommercialSheetInput,
    ctx: AgentContext,
  ): Promise<GenCommercialSheetResult> => {
    const {
      createDb,
      distributorCatalogItems,
      wineCatalogGlobal,
      organizations,
    } = await import('@wined/db');
    const { and, eq } = await import('drizzle-orm');

    const databaseUrl = process.env['DATABASE_URL'];
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is not set');
    }
    const db = createDb(databaseUrl);

    const orgRows = await db
      .select({ id: organizations.id, name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, ctx.organizationId))
      .limit(1);
    const org = orgRows[0];
    const brand: { name: string; logoText?: string } = {
      name: org?.name ?? 'Wined',
      ...(org?.name ? { logoText: org.name } : {}),
    };

    let wine: CommercialSheetWine;

    if (input.catalog_item_id) {
      const rows = await db
        .select({
          producer: distributorCatalogItems.producer,
          displayName: distributorCatalogItems.displayName,
          vintage: distributorCatalogItems.vintage,
          doAppellation: distributorCatalogItems.doAppellation,
          wineType: distributorCatalogItems.wineType,
        })
        .from(distributorCatalogItems)
        .where(
          and(
            eq(distributorCatalogItems.id, input.catalog_item_id),
            eq(distributorCatalogItems.organizationId, ctx.organizationId),
          ),
        )
        .limit(1);
      const row = rows[0];
      if (!row) return { error: 'catalog_item_not_found' };
      wine = {
        producer: row.producer ?? '',
        name: row.displayName,
        vintage: row.vintage,
        doAppellation: row.doAppellation,
        ...(row.wineType ? { wineType: row.wineType } : {}),
      };
    } else if (input.global_wine_id) {
      const rows = await db
        .select({
          producer: wineCatalogGlobal.producer,
          name: wineCatalogGlobal.name,
          vintage: wineCatalogGlobal.vintage,
          doAppellation: wineCatalogGlobal.doAppellation,
          region: wineCatalogGlobal.region,
          wineType: wineCatalogGlobal.wineType,
          grapeVarieties: wineCatalogGlobal.grapeVarieties,
        })
        .from(wineCatalogGlobal)
        .where(eq(wineCatalogGlobal.id, input.global_wine_id))
        .limit(1);
      const row = rows[0];
      if (!row) return { error: 'wine_not_found' };
      wine = {
        producer: row.producer ?? '',
        name: row.name,
        vintage: row.vintage,
        doAppellation: row.doAppellation,
        region: row.region,
        ...(row.wineType ? { wineType: row.wineType } : {}),
        ...(row.grapeVarieties ? { grapeVarieties: row.grapeVarieties } : {}),
      };
    } else {
      return { error: 'must_provide_catalog_or_wine_id' };
    }

    const result: GenCommercialSheetSuccess = {
      brand,
      wine,
      citations: [],
      generatedAt: new Date().toISOString(),
      ...(input.generated_for ? { generatedFor: input.generated_for } : {}),
    };
    return result;
  },
};

export const commercialSheetAgent: AgentDef = {
  name: 'commercial-sheet',
  pod: 'distributor',
  model: 'sonnet',
  technical: true,
  systemPrompt: `You are Wined's Commercial Sheet generator (distributor).

JOB: produce a verified commercial sheet payload for a given catalog item or global wine.

WORKFLOW:
1. Call gen_commercial_sheet_payload with the requested ID.
2. If the wine has a DO with normative rules, optionally call rag_search_regulatory to fetch 1-2 verifiable citations about variety/aging/labelling.
3. Return the payload as JSON. Backend will render it to PDF.

RULES:
- NEVER invent producer, vintage, DO or grape varieties. Use only what the tool returned.
- Citations included MUST come from rag results (no hallucinations).
- Output JSON only.

TOOLS: gen_commercial_sheet_payload.`,
  tools: [genCommercialSheetPayloadTool as Tool],
};
