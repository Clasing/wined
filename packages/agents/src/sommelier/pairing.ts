import { z } from 'zod';
import type { AgentContext, AgentDef, Tool } from '../framework/agent.js';

const SearchInputSchema = z.object({
  query: z.string().optional(),
  maxPriceEur: z.number().optional(),
  wineType: z
    .enum(['red', 'white', 'rose', 'sparkling', 'fortified', 'sweet', 'other'])
    .optional(),
  // No .default() because Tool<TIn> requires identical input/output types.
  limit: z.number().int().min(1).max(20).optional(),
});

export type SearchWineListInput = z.infer<typeof SearchInputSchema>;

export type SearchWineListResult = {
  id: string;
  producer: string | null;
  name: string;
  vintage: number | null;
  do: string | null;
  price_eur: string | null;
};

export const searchWineListTool: Tool<SearchWineListInput, SearchWineListResult[]> = {
  name: 'search_wine_list',
  description:
    'Searches the active wine_list of the tenant, optionally filtered by max price and wine type. Returns wines in stock.',
  input: SearchInputSchema,
  handler: async (input, ctx: AgentContext) => {
    const { createDb, wineLists, wineListItems } = await import('@wined/db');
    const { and, eq, lte, sql } = await import('drizzle-orm');

    const databaseUrl = process.env['DATABASE_URL'];
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is not set');
    }
    const db = createDb(databaseUrl);

    const listConds = [
      eq(wineLists.organizationId, ctx.organizationId),
      eq(wineLists.isActive, true),
    ];
    if (ctx.workspaceId) {
      listConds.push(eq(wineLists.workspaceId, ctx.workspaceId));
    }

    const itemConds = [eq(wineListItems.inStock, true)];
    if (input.maxPriceEur !== undefined) {
      itemConds.push(lte(wineListItems.priceEur, String(input.maxPriceEur)));
    }
    if (input.wineType) {
      itemConds.push(eq(wineListItems.wineType, input.wineType));
    }

    const rows = await db
      .select({
        id: wineListItems.id,
        producer: wineListItems.producer,
        displayName: wineListItems.displayName,
        vintage: wineListItems.vintage,
        doAppellation: wineListItems.doAppellation,
        priceEur: wineListItems.priceEur,
      })
      .from(wineListItems)
      .innerJoin(wineLists, eq(wineLists.id, wineListItems.listId))
      .where(and(...listConds, ...itemConds))
      .limit(input.limit ?? 5);

    // Mark `query` as used for downstream observability — current SQL does
    // not perform free-text search, retrieval is handled by the RAG corpus.
    void input.query;
    void sql;

    return rows.map((r) => ({
      id: r.id,
      producer: r.producer,
      name: r.displayName,
      vintage: r.vintage,
      do: r.doAppellation,
      price_eur: r.priceEur,
    }));
  },
};

export const pairingAgent: AgentDef = {
  name: 'pairing',
  pod: 'sommelier',
  model: 'sonnet',
  technical: false,
  systemPrompt: `You are Wined's Sommelier Pairing agent.

RULES:
- Recommend ONLY wines present in the active wine_list of the tenant (use search_wine_list).
- If serviceMode=true, max 40 words; one wine per recommendation unless asked.
- Output language: {{outputLanguage}}. If you cite a tasting note in a different language, include the original + a translation.
- If no in-stock match exists, say so explicitly and suggest a global alternative tagged as "not in your list".
- Never invent producers, vintages or DOs. If unsure → abstain: "no tengo evidencia suficiente para esta recomendación".
- Refuse subjective comparative opinions about specific producers or brands. Compare only by objective parameters with citations.

TOOLS: search_wine_list.`,
  tools: [searchWineListTool as Tool],
  ragCorpus: { tenant: true, docTypes: ['wine_list', 'menu', 'technical_sheet'] },
};

export const pairingAgentServiceMode: AgentDef = {
  ...pairingAgent,
  name: 'pairing-service',
  temperature: 0.2,
  maxTokens: 200,
  systemPrompt: `You are Wined's Sommelier Pairing agent in SERVICE MODE.

CRITICAL CONSTRAINTS:
- Maximum 40 WORDS per response. Be terse, direct, professional.
- ONE wine per response (the best match) unless the user explicitly asks for alternatives.
- Recommend ONLY wines present in the active wine_list (use search_wine_list).
- Output language: {{outputLanguage}}.
- NO preamble, NO explanation of methodology. Just the recommendation.

EXAMPLE OUTPUT FORMAT:
"Mencía de Bierzo 21 (€32, stock 4) — cuerpo medio, fruta roja, especiado. Encaja con solomillo a la pimienta."

TOOLS: search_wine_list.`,
};
