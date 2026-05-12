import { z } from 'zod';
import type { AgentContext, AgentDef, Tool } from '../framework/agent.js';

const SearchInputSchema = z.object({
  text_query: z
    .string()
    .optional()
    .describe('Free text search across producer/displayName'),
  wine_type: z
    .enum(['red', 'white', 'rose', 'sparkling', 'fortified', 'sweet', 'other'])
    .optional(),
  do_appellation: z.string().optional(),
  vintage_min: z.number().int().optional(),
  vintage_max: z.number().int().optional(),
  price_min_eur: z.number().optional(),
  price_max_eur: z.number().optional(),
  stock_min: z.number().int().optional(),
  in_stock: z.boolean().optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

export type SearchDistributorCatalogInput = z.infer<typeof SearchInputSchema>;

export type SearchDistributorCatalogResult = {
  id: string;
  producer: string | null;
  name: string;
  vintage: number | null;
  do: string | null;
  wine_type: string | null;
  price_eur: string | null;
  stock: number;
};

export const searchDistributorCatalogTool: Tool<
  SearchDistributorCatalogInput,
  SearchDistributorCatalogResult[]
> = {
  name: 'search_distributor_catalog',
  description:
    "Search the distributor's active catalog with structured filters and free-text. Returns items with producer, name, vintage, DO, wine_type, stock and price.",
  input: SearchInputSchema,
  handler: async (input, ctx: AgentContext) => {
    const { createDb, distributorCatalogItems, distributorCatalogs } =
      await import('@wined/db');
    const { and, eq, gte, ilike, lte, or, sql } = await import('drizzle-orm');

    const databaseUrl = process.env['DATABASE_URL'];
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is not set');
    }
    const db = createDb(databaseUrl);

    const conds = [
      eq(distributorCatalogItems.organizationId, ctx.organizationId),
      eq(distributorCatalogs.active, true),
    ];

    if (input.text_query) {
      const pattern = `%${input.text_query}%`;
      const textCond = or(
        ilike(distributorCatalogItems.producer, pattern),
        ilike(distributorCatalogItems.displayName, pattern),
      );
      if (textCond) conds.push(textCond);
    }
    if (input.wine_type) {
      conds.push(eq(distributorCatalogItems.wineType, input.wine_type));
    }
    if (input.do_appellation) {
      conds.push(
        ilike(distributorCatalogItems.doAppellation, `%${input.do_appellation}%`),
      );
    }
    if (input.vintage_min !== undefined) {
      conds.push(gte(distributorCatalogItems.vintage, input.vintage_min));
    }
    if (input.vintage_max !== undefined) {
      conds.push(lte(distributorCatalogItems.vintage, input.vintage_max));
    }
    if (input.price_min_eur !== undefined) {
      conds.push(
        gte(distributorCatalogItems.pvpEur, String(input.price_min_eur)),
      );
    }
    if (input.price_max_eur !== undefined) {
      conds.push(
        lte(distributorCatalogItems.pvpEur, String(input.price_max_eur)),
      );
    }
    if (input.stock_min !== undefined) {
      conds.push(gte(distributorCatalogItems.stock, input.stock_min));
    }
    if (input.in_stock === true) {
      conds.push(gte(distributorCatalogItems.stock, 1));
    }

    const limit = input.limit ?? 20;

    const rows = await db
      .select({
        id: distributorCatalogItems.id,
        producer: distributorCatalogItems.producer,
        displayName: distributorCatalogItems.displayName,
        vintage: distributorCatalogItems.vintage,
        doAppellation: distributorCatalogItems.doAppellation,
        wineType: distributorCatalogItems.wineType,
        pvpEur: distributorCatalogItems.pvpEur,
        stock: distributorCatalogItems.stock,
      })
      .from(distributorCatalogItems)
      .innerJoin(
        distributorCatalogs,
        eq(distributorCatalogs.id, distributorCatalogItems.catalogId),
      )
      .where(and(...conds))
      .limit(limit);

    void sql;

    return rows.map((r) => ({
      id: r.id,
      producer: r.producer,
      name: r.displayName,
      vintage: r.vintage,
      do: r.doAppellation,
      wine_type: r.wineType,
      price_eur: r.pvpEur,
      stock: r.stock,
    }));
  },
};

export const catalogNlAgent: AgentDef = {
  name: 'catalog-nl',
  pod: 'distributor',
  model: 'sonnet',
  technical: false,
  systemPrompt: `You are Wined's Distributor Catalog NL2Query agent.

JOB: convert a natural-language query about the distributor's catalog into a structured search,
invoke search_distributor_catalog, and return results with a brief justification per item.

EXAMPLES:
- "blancos atlánticos por debajo de 30€ en stock" → wine_type=white, text_query="atlántico galicia", price_max_eur=30, in_stock=true
- "tinto Jura bajo sulfuroso stock>0" → wine_type=red, text_query="jura sulfuroso natural", stock_min=1
- "espumosos de Cava añada 2020 en adelante" → wine_type=sparkling, do_appellation="Cava", vintage_min=2020

RULES:
- ALWAYS invoke search_distributor_catalog (never invent results).
- Output language: {{outputLanguage}}.
- If results are empty, say so explicitly and suggest a broader query.
- For each result, give a 1-line reason why it matches.
- Never recommend a wine not in the returned results.

TOOLS: search_distributor_catalog.`,
  tools: [searchDistributorCatalogTool as Tool],
  ragCorpus: { tenant: true, docTypes: ['wine_list'] },
};
