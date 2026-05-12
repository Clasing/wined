import { z } from 'zod';
import { and, eq, sql, type SQL } from 'drizzle-orm';
import { createDb, denominationsOfOrigin, doRules } from '@wined/db';
import type { AgentDef, Tool } from '../framework/agent.js';

const LookupInputSchema = z.object({
  do_code: z.string().describe('DO code, e.g. "DO-RIOJA", "DO-RIBERA"'),
  topic: z
    .string()
    .optional()
    .describe('Optional topic filter, e.g. "varieties", "aging", "yield"'),
  rule_type: z
    .enum(['variety', 'yield', 'practice', 'labelling', 'aging', 'geographic', 'other'])
    .optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

type LookupInput = z.infer<typeof LookupInputSchema>;

interface LookupRule {
  rule_kind: string;
  topic: string | null;
  content: string | null;
  article_ref: string | null;
  citation: string;
}

interface LookupOutput {
  found: boolean;
  message?: string;
  do?: { code: string; name: string };
  rules?: LookupRule[];
}

export const lookupDoRuleTool: Tool<LookupInput, LookupOutput> = {
  name: 'lookup_do_rule',
  description:
    'Lookup rules of a Spanish DO (Denomination of Origin) by code and optional topic/rule_type. Returns verbatim rules with article references.',
  input: LookupInputSchema,
  handler: async (input) => {
    const connectionString = process.env['DATABASE_URL'];
    if (!connectionString) throw new Error('DATABASE_URL not set');
    const db = createDb(connectionString);

    const doRowResult = await db
      .select()
      .from(denominationsOfOrigin)
      .where(eq(denominationsOfOrigin.code, input.do_code));
    const doRow = doRowResult[0];
    if (!doRow) {
      return { found: false, message: `DO not found: ${input.do_code}` };
    }

    const conditions: SQL[] = [eq(doRules.doId, doRow.id)];
    if (input.rule_type) {
      conditions.push(eq(doRules.ruleKind, input.rule_type));
    }
    if (input.topic) {
      const needle = `%${input.topic}%`;
      conditions.push(
        sql`(${doRules.payload}->>'topic' ILIKE ${needle} OR ${doRules.payload}->>'content' ILIKE ${needle})`,
      );
    }

    const limit = input.limit ?? 10;
    const rows = await db
      .select()
      .from(doRules)
      .where(and(...conditions))
      .limit(limit);

    return {
      found: true,
      do: { code: doRow.code, name: doRow.name },
      rules: rows.map((r) => {
        const payload = (r.payload ?? {}) as {
          topic?: string;
          content?: string;
          articleRef?: string;
        };
        const ref = payload.articleRef ?? r.id;
        return {
          rule_kind: r.ruleKind,
          topic: payload.topic ?? null,
          content: payload.content ?? null,
          article_ref: payload.articleRef ?? null,
          citation: `[reg:DO-${doRow.code}-${ref}]`,
        };
      }),
    };
  },
};

export const complianceAgent: AgentDef = {
  name: 'compliance',
  pod: 'cellar',
  model: 'sonnet',
  technical: true,
  systemPrompt: `You are Wined's Compliance Specialist for Spanish DOs/IGPs.

JOB: answer questions about what is permitted/prohibited in a specific Denomination of Origin (DO),
citing the exact rule from the pliego.

HARD RULES:
- ALWAYS invoke lookup_do_rule first. NEVER assert from memory.
- Every claim MUST include a citation [reg:DO-<code>-<ref>] returned by the tool.
- If the DO is not in our corpus, say so explicitly and suggest the user upload the pliego.
- Source tier hierarchy: regulation > consensus(OIV) > literature.
- Output language: {{outputLanguage}}.

EXAMPLES:
- "¿qué variedades están autorizadas en DO Rioja?" → invoke lookup_do_rule(do_code='DO-RIOJA', rule_type='variety')
- "¿tiempo mínimo de crianza para un Gran Reserva en Ribera?" → lookup_do_rule(do_code='DO-RIBERA', rule_type='aging')
- "¿rendimiento máximo de kg/ha en Rías Baixas?" → lookup_do_rule(do_code='DO-RIAS-BAIXAS', rule_type='yield')

TOOLS: lookup_do_rule.`,
  tools: [lookupDoRuleTool as Tool],
  ragCorpus: { tenant: false, global: ['do'] },
};
