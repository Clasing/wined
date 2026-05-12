import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { createDb } from '@wined/db';
import { rerankBySourceTier, type RetrievalChunk, type SourceTier } from '@wined/llm-gateway';
import { createEmbeddingProvider } from '@wined/embedding';
import type { Tool } from '../framework/agent.js';

const InputSchema = z.object({
  query: z.string(),
  topK: z.number().int().min(1).max(20).optional(),
});

type Input = z.infer<typeof InputSchema>;

interface RagOutputChunk {
  id: string;
  citation: string;
  content: string;
  source_tier: SourceTier;
  similarity: number;
}

interface RagOutput {
  chunks: RagOutputChunk[];
}

function tierLabelToNumber(label: string): SourceTier {
  switch (label) {
    case 'regulation':
      return 1;
    case 'consensus':
      return 2;
    case 'literature':
      return 3;
    case 'tenant_private':
      return 4;
    case 'global_catalog':
    default:
      return 5;
  }
}

export const ragSearchRegulatoryTool: Tool<Input, RagOutput> = {
  name: 'rag_search_regulatory',
  description:
    'Semantic search over regulatory corpus (Reg UE, OIV, BOE, DO rules) + tenant private books. Returns top chunks with source_tier-aware ranking and citation IDs.',
  input: InputSchema,
  handler: async (input, ctx) => {
    const connectionString = process.env['DATABASE_URL'];
    if (!connectionString) throw new Error('DATABASE_URL not set');

    const db = createDb(connectionString);
    const embedder = createEmbeddingProvider();
    const topK = input.topK ?? 8;

    const embeddings = await embedder.embed([input.query], 'query');
    const queryEmb = embeddings[0];
    if (!queryEmb) throw new Error('embedding failed');
    const embStr = '[' + queryEmb.join(',') + ']';

    const regResults = await db.execute(sql`
      SELECT id, reg_code, article_ref, title, body, source_tier,
             1 - (embedding <=> ${embStr}::vector) AS similarity
      FROM regulatory_corpus
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> ${embStr}::vector
      LIMIT ${topK}
    `);

    const docResults = await db.execute(sql`
      SELECT dc.id, dc.document_id, dc.content, dc.source_tier, d.title AS doc_title,
             1 - (dc.embedding <=> ${embStr}::vector) AS similarity
      FROM document_chunks dc
      JOIN documents d ON d.id = dc.document_id
      WHERE dc.organization_id = ${ctx.organizationId}::uuid
        AND d.doc_type IN ('book', 'technical_sheet', 'vinification_log', 'lab_report')
      ORDER BY dc.embedding <=> ${embStr}::vector
      LIMIT ${topK}
    `);

    const chunks: RetrievalChunk[] = [];

    for (const row of regResults as unknown as Array<{
      id: string;
      reg_code: string;
      article_ref: string | null;
      title: string;
      body: string | null;
      source_tier: string;
      similarity: number | string;
    }>) {
      chunks.push({
        id: row.id,
        documentId: row.reg_code,
        content: `[${row.reg_code}${row.article_ref ? ' ' + row.article_ref : ''}] ${row.title}\n\n${(row.body ?? '').slice(0, 1500)}`,
        similarity: Number(row.similarity),
        sourceTier: tierLabelToNumber(row.source_tier),
        metadata: {
          reg_code: row.reg_code,
          article_ref: row.article_ref,
          type: 'regulation',
        },
      });
    }

    for (const row of docResults as unknown as Array<{
      id: string;
      document_id: string;
      content: string | null;
      source_tier: string;
      doc_title: string | null;
      similarity: number | string;
    }>) {
      chunks.push({
        id: row.id,
        documentId: row.document_id,
        content: `[doc:${row.document_id}] ${(row.content ?? '').slice(0, 1500)}`,
        similarity: Number(row.similarity),
        sourceTier: tierLabelToNumber(row.source_tier),
        metadata: { doc_title: row.doc_title, type: 'tenant_doc' },
      });
    }

    const reranked = rerankBySourceTier(chunks, {
      privatePreference:
        ctx.kbPreference === 'global_first' ? 'global_first' : 'private_first',
    });

    return {
      chunks: reranked.slice(0, topK).map((c) => {
        const meta = c.metadata ?? {};
        const isReg = meta['type'] === 'regulation';
        const citation = isReg
          ? `[reg:${String(meta['reg_code'] ?? c.documentId)}${meta['article_ref'] ? '-' + String(meta['article_ref']) : ''}]`
          : `[doc:${c.documentId}]`;
        return {
          id: c.id,
          citation,
          content: c.content,
          source_tier: c.sourceTier,
          similarity: c.similarity,
        };
      }),
    };
  },
};
