import { z } from 'zod';
import { eq } from 'drizzle-orm';
import {
  createDb,
  denominationsOfOrigin,
  doRules,
} from '@wined/db';
import { LLMGateway } from '@wined/llm-gateway';
import type { AgentDef } from '@wined/agents';
import type {
  CuratorImpl,
  CuratorRunArgs,
  CuratorRunError,
} from './curator.js';

const RULE_KINDS = [
  'variety',
  'yield',
  'practice',
  'labelling',
  'aging',
  'geographic',
  'other',
] as const;

const DoRuleSchema = z.object({
  rule_type: z.enum(RULE_KINDS),
  topic: z.string(),
  content: z.string(),
  article_ref: z.string().nullable(),
});

const DoExtractionSchema = z.object({
  do_code: z.string(),
  do_name: z.string(),
  rules: z.array(DoRuleSchema),
});

const DO_CURATOR_SYSTEM_PROMPT = `You are the DO Curator.

JOB: process the pliego (official rules) of a Spanish Denomination of Origin / IGP / VT
and extract structured rules into JSON.

FOR EACH RULE found, produce:
- rule_type: variety | yield | practice | labelling | aging | geographic | other
- topic: short tag, e.g. "max yield kg/ha", "permitted varieties", "minimum aging months"
- content: the exact rule statement (verbatim, in original language ES)
- article_ref: section/article reference if present (or null)

RULES:
- Preserve verbatim text. Do NOT paraphrase.
- Skip definitions, preambles, geographic delimitation paragraphs (unless they contain a rule).
- Output a JSON object with do_code, do_name and rules[]. Nothing else.`;

export const doCuratorAgent: AgentDef = {
  name: 'do-curator',
  pod: 'curator',
  model: 'sonnet',
  technical: true,
  systemPrompt: DO_CURATOR_SYSTEM_PROMPT,
  tools: [],
};

export type PriorityDo = {
  do_code: string;
  do_name: string;
  region: string;
  country: string;
  kind: 'DO' | 'DOCa' | 'DOP' | 'IGP' | 'VT';
};

export const PRIORITY_DOS: readonly PriorityDo[] = [
  {
    do_code: 'DO-RIOJA',
    do_name: 'Rioja',
    region: 'La Rioja',
    country: 'ES',
    kind: 'DOCa',
  },
  {
    do_code: 'DO-RIBERA',
    do_name: 'Ribera del Duero',
    region: 'Castilla y León',
    country: 'ES',
    kind: 'DO',
  },
  {
    do_code: 'DO-CAVA',
    do_name: 'Cava',
    region: 'Multiple',
    country: 'ES',
    kind: 'DO',
  },
  {
    do_code: 'DO-RIAS-BAIXAS',
    do_name: 'Rías Baixas',
    region: 'Galicia',
    country: 'ES',
    kind: 'DO',
  },
  {
    do_code: 'DO-JEREZ',
    do_name: 'Jerez-Xérès-Sherry',
    region: 'Andalucía',
    country: 'ES',
    kind: 'DO',
  },
] as const;

export type DoCuratorPayload = {
  do_code: string;
  pliegoText: string;
};

function getEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function extractJsonObject(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const fenced = text.match(/```json\n([\s\S]+?)\n```/);
    if (fenced && fenced[1]) return JSON.parse(fenced[1]);
    const objMatch = text.match(/\{[\s\S]+\}/);
    if (objMatch) return JSON.parse(objMatch[0]);
    throw new Error('No JSON object found in response');
  }
}

export const doCurator: CuratorImpl = {
  agent: doCuratorAgent,

  async run(args: CuratorRunArgs) {
    const payload = args.payload as DoCuratorPayload | undefined;
    if (!payload || !payload.do_code || !payload.pliegoText) {
      return {
        itemsProcessed: 0,
        errors: [
          {
            message:
              'do-curator requires payload.do_code and payload.pliegoText',
          },
        ] as CuratorRunError[],
      };
    }

    const doMeta = PRIORITY_DOS.find((d) => d.do_code === payload.do_code);
    if (!doMeta) {
      return {
        itemsProcessed: 0,
        errors: [
          { message: `Unknown do_code: ${payload.do_code}` },
        ] as CuratorRunError[],
      };
    }

    const db = createDb(getEnv('DATABASE_URL'));
    const gateway = new LLMGateway({
      anthropicKey: getEnv('ANTHROPIC_API_KEY'),
      redisUrl: getEnv('REDIS_URL'),
    });

    let itemsProcessed = 0;
    const errors: CuratorRunError[] = [];

    try {
      // 1. Ensure DO exists
      const existing = await db
        .select()
        .from(denominationsOfOrigin)
        .where(eq(denominationsOfOrigin.code, payload.do_code));
      let doRow = existing[0];
      if (!doRow) {
        const inserted = await db
          .insert(denominationsOfOrigin)
          .values({
            code: payload.do_code,
            name: doMeta.do_name,
            country: doMeta.country,
            kind: doMeta.kind,
          })
          .returning();
        doRow = inserted[0];
      }
      if (!doRow) {
        throw new Error('failed to upsert denominations_of_origin row');
      }

      // 2. Sonnet extracts
      const result = await gateway.generate({
        model: 'claude-sonnet-4',
        system: DO_CURATOR_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `DO: ${doMeta.do_name} (${payload.do_code})\n\nPliego text:\n${payload.pliegoText.slice(
              0,
              100_000,
            )}\n\nReturn JSON.`,
          },
        ],
        tenantId: 'system',
        agentName: 'do-curator',
        technical: false,
        maxTokens: 6000,
        temperature: 0.1,
        metadata: { do_code: payload.do_code },
      });

      // 3. Parse + validate
      const parsedJson = extractJsonObject(result.content);
      const data = DoExtractionSchema.parse(parsedJson);

      // 4. Insert rules
      for (const rule of data.rules) {
        try {
          await db.insert(doRules).values({
            doId: doRow.id,
            ruleKind: rule.rule_type,
            payload: {
              topic: rule.topic,
              content: rule.content,
              articleRef: rule.article_ref,
            },
          });
          itemsProcessed++;
        } catch (err) {
          const e = err as Error;
          errors.push({ message: `Insert rule: ${e.message}` });
        }
      }
    } catch (err) {
      const e = err as Error;
      errors.push(
        e.stack !== undefined
          ? { message: e.message, stack: e.stack }
          : { message: e.message },
      );
    }

    return { itemsProcessed, errors };
  },
};
