import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { createDb, regulatoryCorpus } from '@wined/db';
import type { Tool } from '../framework/agent.js';

const InputSchema = z.object({
  reg_code: z.string(),
  article_ref: z.string().optional(),
});

type Input = z.infer<typeof InputSchema>;

interface CiteOutput {
  found: boolean;
  citation?: string;
  title?: string;
  jurisdiction?: string;
  body_verbatim?: string;
  effective_date?: string | null;
}

export const citeRegulationTool: Tool<Input, CiteOutput> = {
  name: 'cite_regulation',
  description:
    'Resolve a regulation citation by reg_code (and optionally article_ref) to its formal citation string and verbatim body.',
  input: InputSchema,
  handler: async (input) => {
    const connectionString = process.env['DATABASE_URL'];
    if (!connectionString) throw new Error('DATABASE_URL not set');

    const db = createDb(connectionString);
    const conditions = [eq(regulatoryCorpus.regCode, input.reg_code)];
    if (input.article_ref) {
      conditions.push(eq(regulatoryCorpus.articleRef, input.article_ref));
    }

    const rows = await db
      .select()
      .from(regulatoryCorpus)
      .where(and(...conditions))
      .limit(1);
    const row = rows[0];
    if (!row) return { found: false };

    return {
      found: true,
      citation: `[reg:${row.regCode}${row.articleRef ? '-' + row.articleRef : ''}]`,
      title: row.title,
      jurisdiction: row.jurisdiction,
      body_verbatim: row.body,
      effective_date: row.effectiveDate ?? null,
    };
  },
};
