import { z } from 'zod';
import { gte, sql } from 'drizzle-orm';
import { createDb, regulatoryCorpus } from '@wined/db';
import { LLMGateway } from '@wined/llm-gateway';
import type { AgentDef } from '@wined/agents';
import type { CuratorImpl, CuratorRunArgs, CuratorRunError } from './curator.js';

const ConflictSchema = z.object({
  topic: z.string(),
  source_a_id: z.string().uuid(),
  source_b_id: z.string().uuid(),
  conflict_type: z.enum(['supersession', 'contradiction', 'ambiguity']),
  resolution_tier: z.enum([
    'regulation',
    'consensus',
    'literature',
    'tenant_private',
  ]),
  resolution_explanation: z.string(),
  mark_obsolete: z.array(z.string().uuid()),
});

const ReviewerResponseSchema = z.object({
  conflicts: z.array(ConflictSchema),
});

const CORPUS_REVIEWER_SYSTEM_PROMPT = `You are the Corpus Reviewer for Wined.

WEEKLY JOB: scan regulatory_corpus entries ingested in the last 7 days plus relevant tenant book chunks.
Detect contradictions on shared topics (SO2 max limits, allowed practices, labelling, aging, varieties).

FOR EACH CONFLICT detected, emit:
- topic (short)
- source_a_id (uuid of the prior/older source)
- source_b_id (uuid of the newer/conflicting source)
- conflict_type: "supersession" | "contradiction" | "ambiguity"
- resolution_tier: which tier wins per hierarchy regulation > consensus(OIV) > literature > tenant_private
- resolution_explanation: 1-3 sentences explaining the resolution
- mark_obsolete: array of chunk UUIDs that should be flagged obsolete (only when supersession is unambiguous)

RULES:
- Be conservative. If ambiguity remains, set type='ambiguity' and DO NOT mark chunks obsolete (leave for human review).
- Cite the IDs exactly as provided in the input.
- Output JSON object { conflicts: [...] }. Nothing else.`;

export const corpusReviewerAgent: AgentDef = {
  name: 'corpus-reviewer',
  pod: 'curator',
  model: 'opus',
  technical: true,
  systemPrompt: CORPUS_REVIEWER_SYSTEM_PROMPT,
  tools: [],
};

export type CorpusReviewerPayload = {
  windowDays?: number;
  topicsFilter?: string[];
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
    throw new Error('corpus-reviewer response is not valid JSON');
  }
}

export const corpusReviewer: CuratorImpl = {
  agent: corpusReviewerAgent,

  async run(args: CuratorRunArgs) {
    const payload = (args.payload ?? {}) as CorpusReviewerPayload;
    const windowDays = payload.windowDays ?? 7;
    const since = new Date(Date.now() - windowDays * 86_400 * 1000);

    const db = createDb(getEnv('DATABASE_URL'));
    const gateway = new LLMGateway({
      anthropicKey: getEnv('ANTHROPIC_API_KEY'),
      redisUrl: getEnv('REDIS_URL'),
    });

    let itemsProcessed = 0;
    const errors: CuratorRunError[] = [];

    try {
      const recentRegs = await db
        .select()
        .from(regulatoryCorpus)
        .where(gte(regulatoryCorpus.createdAt, since))
        .limit(200);

      if (recentRegs.length < 2) {
        return {
          itemsProcessed: 0,
          errors: [
            {
              message: `Only ${recentRegs.length} regs in window, skipping review`,
            },
          ],
        };
      }

      const packed = recentRegs.map((r) => ({
        id: r.id,
        reg_code: r.regCode,
        article_ref: r.articleRef,
        title: r.title,
        body_preview: (r.body ?? '').slice(0, 800),
        topics: (r.meta as { topics?: string[] } | null)?.topics ?? [],
      }));

      const result = await gateway.generate({
        model: 'claude-opus-4',
        system: CORPUS_REVIEWER_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Recent regulations in window (${windowDays}d):\n${JSON.stringify(
              packed,
              null,
              2,
            )}\n\nReturn JSON.`,
          },
        ],
        tenantId: 'system',
        agentName: 'corpus-reviewer',
        technical: true,
        maxTokens: 8000,
        temperature: 0.0,
        metadata: { windowDays },
      });

      const parsed = extractJsonObject(result.content);
      const data = ReviewerResponseSchema.parse(parsed);

      for (const c of data.conflicts) {
        try {
          const resolutionText = `[${c.conflict_type}] ${c.resolution_explanation}`;
          await db.execute(sql`
            INSERT INTO corpus_conflicts
              (detected_by, source_a_id, source_b_id, topic, resolution, resolution_tier, status)
            VALUES
              (${'corpus-reviewer'},
               ${c.source_a_id}::uuid,
               ${c.source_b_id}::uuid,
               ${c.topic},
               ${resolutionText},
               ${c.resolution_tier}::source_tier,
               ${'open'})
          `);
          itemsProcessed++;

          for (const chunkId of c.mark_obsolete) {
            await db.execute(sql`
              UPDATE document_chunks
              SET meta = jsonb_set(coalesce(meta, '{}'::jsonb), '{obsolete}', 'true'::jsonb)
              WHERE id = ${chunkId}::uuid
            `);
          }
        } catch (err) {
          const e = err as Error;
          errors.push({ message: `Insert conflict ${c.topic}: ${e.message}` });
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

export const reviewerCurator = corpusReviewer;
