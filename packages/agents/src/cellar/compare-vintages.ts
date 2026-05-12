import { z } from 'zod';
import type { AgentDef, Tool, AgentContext } from '../framework/agent.js';

const InputSchema = z.object({
  vintage_year_a: z.number().int().min(1900).max(2100),
  vintage_year_b: z.number().int().min(1900).max(2100),
  vineyard_id: z.string().uuid().optional(),
});

type Input = z.infer<typeof InputSchema>;

type VintageAggregate = {
  year: number;
  intakes: {
    count: number;
    avg_baume: number | null;
    avg_ph: number | null;
    avg_sanity: number | null;
    total_weight_kg: number;
  };
  labs: {
    count: number;
    avg_alcohol: number | null;
    avg_ph: number | null;
    avg_total_acidity: number | null;
    avg_volatile_acidity: number | null;
    avg_so2_free: number | null;
    avg_residual_sugar: number | null;
  };
};

type CompareResult = {
  a: VintageAggregate;
  b: VintageAggregate;
  deltas: Record<string, { a: number | null; b: number | null; delta: number | null }>;
};

export const compareVintagesTool: Tool<Input, CompareResult> = {
  name: 'compare_vintages',
  description:
    'Compare two vintages by aggregating lab_analyses and grape_intakes data. Returns side-by-side parameters with deltas.',
  input: InputSchema,
  handler: async (input, ctx: AgentContext) => {
    const { createDb } = await import('@wined/db');
    const { sql } = await import('drizzle-orm');
    const db = createDb(process.env['DATABASE_URL']!);

    async function aggregateVintage(year: number): Promise<VintageAggregate> {
      const intakesResult = await db.execute(sql`
        SELECT
          COUNT(*) AS intake_count,
          AVG(CAST(baume AS numeric)) AS avg_baume,
          AVG(CAST(ph AS numeric)) AS avg_ph,
          AVG(CAST(sanity_score AS numeric)) AS avg_sanity,
          SUM(CAST(weight_kg AS numeric)) AS total_weight_kg
        FROM grape_intakes
        WHERE organization_id = ${ctx.organizationId}::uuid
          AND vintage_year = ${year}
          ${input.vineyard_id ? sql`AND vineyard_id = ${input.vineyard_id}::uuid` : sql``}
      `);

      const labsResult = await db.execute(sql`
        SELECT
          COUNT(*) AS sample_count,
          AVG(CAST(alcohol_pct AS numeric)) AS avg_alcohol,
          AVG(CAST(ph AS numeric)) AS avg_ph,
          AVG(CAST(total_acidity_g_l AS numeric)) AS avg_ta,
          AVG(CAST(volatile_acidity_g_l AS numeric)) AS avg_va,
          AVG(CAST(so2_free_mg_l AS numeric)) AS avg_so2_free,
          AVG(CAST(residual_sugar_g_l AS numeric)) AS avg_rs
        FROM lab_analyses la
        JOIN wine_lots wl ON wl.id = la.lot_id
        JOIN vintages v ON v.id = wl.vintage_id
        WHERE la.organization_id = ${ctx.organizationId}::uuid
          AND v.year = ${year}
      `);

      const intakeRow =
        ((intakesResult as { rows?: Record<string, unknown>[] }).rows?.[0] ??
          (intakesResult as unknown as Record<string, unknown>[])[0] ??
          {}) as Record<string, unknown>;
      const labRow =
        ((labsResult as { rows?: Record<string, unknown>[] }).rows?.[0] ??
          (labsResult as unknown as Record<string, unknown>[])[0] ??
          {}) as Record<string, unknown>;

      const num = (v: unknown): number | null =>
        v == null || v === '' ? null : Number(v);

      return {
        year,
        intakes: {
          count: Number(intakeRow['intake_count'] ?? 0),
          avg_baume: num(intakeRow['avg_baume']),
          avg_ph: num(intakeRow['avg_ph']),
          avg_sanity: num(intakeRow['avg_sanity']),
          total_weight_kg: Number(intakeRow['total_weight_kg'] ?? 0),
        },
        labs: {
          count: Number(labRow['sample_count'] ?? 0),
          avg_alcohol: num(labRow['avg_alcohol']),
          avg_ph: num(labRow['avg_ph']),
          avg_total_acidity: num(labRow['avg_ta']),
          avg_volatile_acidity: num(labRow['avg_va']),
          avg_so2_free: num(labRow['avg_so2_free']),
          avg_residual_sugar: num(labRow['avg_rs']),
        },
      };
    }

    const [a, b] = await Promise.all([
      aggregateVintage(input.vintage_year_a),
      aggregateVintage(input.vintage_year_b),
    ]);

    const deltas: Record<
      string,
      { a: number | null; b: number | null; delta: number | null }
    > = {};
    const labKeys: Array<Exclude<keyof VintageAggregate['labs'], 'count'>> = [
      'avg_alcohol',
      'avg_ph',
      'avg_total_acidity',
      'avg_volatile_acidity',
      'avg_so2_free',
      'avg_residual_sugar',
    ];
    for (const key of labKeys) {
      const aVal = a.labs[key];
      const bVal = b.labs[key];
      deltas[`labs.${key}`] = {
        a: aVal,
        b: bVal,
        delta:
          typeof aVal === 'number' && typeof bVal === 'number'
            ? Number((bVal - aVal).toFixed(3))
            : null,
      };
    }

    return { a, b, deltas };
  },
};

export const compareVintagesAgent: AgentDef = {
  name: 'compare-vintages',
  pod: 'cellar',
  model: 'sonnet',
  technical: false,
  systemPrompt: `You are Wined's Vintage Comparison agent.

JOB: when the user asks to compare two vintages (e.g. "compárame 2022 y 2023"), invoke compare_vintages and present the results as a side-by-side table with interpretation of the most notable deltas.

RULES:
- ALWAYS invoke compare_vintages first.
- Highlight only deltas > 10% from each other or absolute values out of typical ranges.
- Use plain prose for interpretation; do not invent context not in the tool output.
- Output language: {{outputLanguage}}.

TOOLS: compare_vintages.`,
  tools: [compareVintagesTool as Tool],
};
