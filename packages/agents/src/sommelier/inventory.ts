import { z } from 'zod';
import type { AgentContext, AgentDef, Tool } from '../framework/agent.js';

const SearchInputSchema = z.object({
  text_query: z.string().optional(),
  wine_type: z
    .enum(['red', 'white', 'rose', 'sparkling', 'fortified', 'sweet', 'other'])
    .optional(),
  do_appellation: z.string().optional(),
  region_keyword: z.string().optional(),
  price_min_eur: z.number().optional(),
  price_max_eur: z.number().optional(),
  vintage_min: z.number().int().optional(),
  vintage_max: z.number().int().optional(),
  in_stock_only: z.boolean().optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

export type SearchTenantInventoryInput = z.infer<typeof SearchInputSchema>;

export type SearchTenantInventoryResult = {
  id: string;
  producer: string | null;
  name: string;
  vintage: number | null;
  do: string | null;
  wine_type: string | null;
  price_eur: string | null;
  stock: number;
};

export const searchTenantInventoryTool: Tool<
  SearchTenantInventoryInput,
  SearchTenantInventoryResult[]
> = {
  name: 'search_tenant_inventory',
  description:
    "Natural-language search over the active wine_list of the tenant. Supports filters by type, DO, region, price range, vintage, stock. Returns wines matching all filters.",
  input: SearchInputSchema,
  handler: async (input, ctx: AgentContext) => {
    const { createDb, wineLists, wineListItems } = await import('@wined/db');
    const { and, eq, gte, lte, ilike, sql } = await import('drizzle-orm');

    const databaseUrl = process.env['DATABASE_URL'];
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is not set');
    }
    const db = createDb(databaseUrl);
    const limit = input.limit ?? 20;

    const listConds = [
      eq(wineLists.organizationId, ctx.organizationId),
      eq(wineLists.isActive, true),
    ];
    if (ctx.workspaceId) {
      listConds.push(eq(wineLists.workspaceId, ctx.workspaceId));
    }

    const itemConds: ReturnType<typeof eq>[] = [];
    if (input.text_query) {
      const like = `%${input.text_query}%`;
      itemConds.push(
        sql`(${wineListItems.producer} ILIKE ${like} OR ${wineListItems.displayName} ILIKE ${like})` as unknown as ReturnType<
          typeof eq
        >,
      );
    }
    if (input.wine_type) {
      itemConds.push(eq(wineListItems.wineType, input.wine_type));
    }
    if (input.do_appellation) {
      itemConds.push(
        ilike(wineListItems.doAppellation, `%${input.do_appellation}%`),
      );
    }
    if (input.region_keyword) {
      const like = `%${input.region_keyword}%`;
      itemConds.push(
        sql`(${wineListItems.doAppellation} ILIKE ${like} OR ${wineListItems.producer} ILIKE ${like})` as unknown as ReturnType<
          typeof eq
        >,
      );
    }
    if (input.price_min_eur !== undefined) {
      itemConds.push(gte(wineListItems.priceEur, String(input.price_min_eur)));
    }
    if (input.price_max_eur !== undefined) {
      itemConds.push(lte(wineListItems.priceEur, String(input.price_max_eur)));
    }
    if (input.vintage_min !== undefined) {
      itemConds.push(gte(wineListItems.vintage, input.vintage_min));
    }
    if (input.vintage_max !== undefined) {
      itemConds.push(lte(wineListItems.vintage, input.vintage_max));
    }
    if (input.in_stock_only) {
      itemConds.push(eq(wineListItems.inStock, true));
    }

    const rows = await db
      .select({
        id: wineListItems.id,
        producer: wineListItems.producer,
        displayName: wineListItems.displayName,
        vintage: wineListItems.vintage,
        doAppellation: wineListItems.doAppellation,
        wineType: wineListItems.wineType,
        priceEur: wineListItems.priceEur,
        stock: wineListItems.stock,
      })
      .from(wineListItems)
      .innerJoin(wineLists, eq(wineLists.id, wineListItems.listId))
      .where(and(...listConds, ...itemConds))
      .limit(limit);

    return rows.map((r) => ({
      id: r.id,
      producer: r.producer,
      name: r.displayName,
      vintage: r.vintage,
      do: r.doAppellation,
      wine_type: r.wineType,
      price_eur: r.priceEur,
      stock: r.stock,
    }));
  },
};

export const inventoryAgent: AgentDef = {
  name: 'inventory',
  pod: 'sommelier',
  model: 'sonnet',
  technical: false,
  systemPrompt: `You are Wined's Inventory NL2Query agent.

JOB: translate natural-language searches over the sommelier's active wine list into structured queries.
Examples:
- "blancos atlánticos menos de 40€ en stock" → wine_type=white, region_keyword="atlantic|galicia|atlántico", price_max_eur=40, in_stock_only=true
- "tintos de Rioja añada 2018-2020" → wine_type=red, do_appellation="Rioja", vintage_min=2018, vintage_max=2020
- "espumosos por menos de 50€" → wine_type=sparkling, price_max_eur=50

RULES:
- ALWAYS invoke search_tenant_inventory.
- NEVER invent results — recommend only what comes back.
- If results are empty, say so and suggest a broader query.
- Output language: {{outputLanguage}}.
- For service mode, max 40 words.

TOOLS: search_tenant_inventory.`,
  tools: [searchTenantInventoryTool as Tool],
  ragCorpus: { tenant: true, docTypes: ['wine_list'] },
};
