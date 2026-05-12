import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { createDb, regulatoryCorpus } from '@wined/db';
import { LLMGateway } from '@wined/llm-gateway';
import { createEmbeddingProvider } from '@wined/embedding';
import type { AgentDef } from '@wined/agents';
import type { CuratorImpl, CuratorRunArgs, CuratorRunError } from './curator.js';
import sourcesJson from './sources.json' with { type: 'json' };

const RegulationArticleSchema = z.object({
  reg_code: z.string(),
  article_ref: z.string(),
  jurisdiction: z.enum(['EU', 'ES', 'OIV', 'DO']),
  effective_date: z.string().nullable(),
  title: z.string(),
  content: z.string(),
  supersedes_ref: z.string().nullable(),
  topics: z.array(z.string()),
  confidence: z.enum(['high', 'low']).default('high'),
});

type RegulationArticle = z.infer<typeof RegulationArticleSchema>;

type SeedSource = {
  reg_code: string;
  title: string;
  jurisdiction: string;
  url: string;
  format: string;
};

const REGULATION_CURATOR_SYSTEM_PROMPT = `You are the Regulation Curator for Wined.

JOB: ingest official wine regulation sources (EUR-Lex, BOE, OIV resolutions) and produce
normalized JSON rows for the regulatory_corpus table.

FOR EACH ARTICLE in the document, extract:
- reg_code (given by caller)
- article_ref (e.g. "Anexo I Parte B", "Artículo 80", "§2.1.18")
- jurisdiction (EU | ES | OIV | DO)
- effective_date (ISO YYYY-MM-DD or null)
- title (article title, verbatim)
- content (article body, verbatim, preserve original language)
- supersedes_ref (if the article derogates a prior one, with confidence flag)
- topics (array of free tags: "so2", "acidity", "labelling", "varieties", etc.)
- confidence ("high" by default; "low" if supersedes detection is uncertain)

RULES:
- Skip preambles, recitals, transitional dispositions unless they carry binding content.
- Preserve verbatim text. Do NOT translate.
- Output JSON array of objects matching the schema. Nothing else.
- If unsure about a derogation, set supersedes_ref=null and confidence='low'.`;

export const regulationCuratorAgent: AgentDef = {
  name: 'regulation-curator',
  pod: 'curator',
  model: 'opus',
  technical: true,
  systemPrompt: REGULATION_CURATOR_SYSTEM_PROMPT,
  tools: [],
};

function getEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

async function fetchSource(url: string, format: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    if (format === 'pdf') {
      // PDF binary parsing requires a parser not wired here; skip until binary handling is added.
      return null;
    }
    const html = await res.text();
    return html
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .slice(0, 200_000);
  } catch {
    return null;
  }
}

function extractJsonArray(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const fenced = text.match(/```json\n([\s\S]+?)\n```/);
    if (fenced && fenced[1]) return JSON.parse(fenced[1]);
    const arrayMatch = text.match(/\[\s*\{[\s\S]+\}\s*\]/);
    if (arrayMatch) return JSON.parse(arrayMatch[0]);
    throw new Error('No JSON array found in response');
  }
}

export const regulationCurator: CuratorImpl = {
  agent: regulationCuratorAgent,

  async run(_args: CuratorRunArgs) {
    const gateway = new LLMGateway({
      anthropicKey: getEnv('ANTHROPIC_API_KEY'),
      redisUrl: getEnv('REDIS_URL'),
    });
    const embedder = createEmbeddingProvider();
    const db = createDb(getEnv('DATABASE_URL'));

    const sources = (sourcesJson as { regulation_seed: SeedSource[] }).regulation_seed;
    let itemsProcessed = 0;
    const errors: CuratorRunError[] = [];

    for (const source of sources) {
      try {
        const documentText = await fetchSource(source.url, source.format);
        if (!documentText) {
          errors.push({ message: `Skipped ${source.reg_code}: fetch returned empty` });
          continue;
        }

        const userContent = `reg_code: ${source.reg_code}\njurisdiction: ${source.jurisdiction}\n\nDocument text:\n${documentText.slice(
          0,
          120_000,
        )}\n\nReturn JSON array.`;

        const result = await gateway.generate({
          model: 'claude-opus-4',
          system: REGULATION_CURATOR_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userContent }],
          tenantId: 'system',
          agentName: 'regulation-curator',
          technical: true,
          maxTokens: 8192,
          temperature: 0.1,
          metadata: { source: source.reg_code },
        });

        const json = extractJsonArray(result.content);
        const articles: RegulationArticle[] = z.array(RegulationArticleSchema).parse(json);
        if (articles.length === 0) continue;

        const texts = articles.map((a) => `${a.title}\n\n${a.content}`);
        const embeddings = await embedder.embed(texts, 'document');

        for (let i = 0; i < articles.length; i++) {
          const a = articles[i];
          const emb = embeddings[i];
          if (!a || !emb) continue;

          const existing = await db
            .select({ id: regulatoryCorpus.id })
            .from(regulatoryCorpus)
            .where(
              and(
                eq(regulatoryCorpus.regCode, a.reg_code),
                eq(regulatoryCorpus.articleRef, a.article_ref),
              ),
            );
          if (existing.length > 0) continue;

          await db.insert(regulatoryCorpus).values({
            source: source.url,
            sourceTier: 'regulation',
            jurisdiction: a.jurisdiction,
            regCode: a.reg_code,
            articleRef: a.article_ref,
            title: a.title,
            body: a.content,
            effectiveDate: a.effective_date,
            language: 'es',
            embedding: emb,
            meta: {
              topics: a.topics,
              confidence: a.confidence,
              supersedesRef: a.supersedes_ref,
              sourceTitle: source.title,
            },
          });
          itemsProcessed++;
        }
      } catch (err) {
        const e = err as Error;
        errors.push(
          e.stack !== undefined
            ? { message: `${source.reg_code}: ${e.message}`, stack: e.stack }
            : { message: `${source.reg_code}: ${e.message}` },
        );
      }
    }

    return { itemsProcessed, errors };
  },
};
