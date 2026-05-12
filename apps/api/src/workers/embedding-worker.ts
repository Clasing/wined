import { makeWorker, type IngestionEmbedJob } from '@wined/ingestion';
import { createEmbeddingProvider } from '@wined/embedding';
import { createDb, withTenant, documentChunks, documents } from '@wined/db';
import { sql } from 'drizzle-orm';
import { env } from '../env.js';

const COHERE_BATCH = 96;
const INSERT_BATCH = 500;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function startEmbeddingWorker(): ReturnType<typeof makeWorker<IngestionEmbedJob>> {
  const embedder = createEmbeddingProvider();
  const db = createDb(env.DATABASE_URL);

  return makeWorker<IngestionEmbedJob>('ingestion.embed', async ({ data }) => {
    const { documentId, orgId, chunks } = data;

    if (chunks.length === 0) {
      return { ok: true, chunksInserted: 0 };
    }

    // Embed in batches (Cohere caps at 96 docs per call).
    const allEmbeddings: number[][] = [];
    for (let i = 0; i < chunks.length; i += COHERE_BATCH) {
      const slice = chunks.slice(i, i + COHERE_BATCH);
      const texts = slice.map((c) => c.content);
      const embs = await embedder.embed(texts, 'document');
      allEmbeddings.push(...embs);
    }

    // Bulk insert + status flip inside a tenant-scoped TX so RLS applies.
    await withTenant(db, orgId, async (tx) => {
      const rows = chunks.map((c, idx) => {
        const embedding = allEmbeddings[idx];
        if (!embedding) {
          throw new Error(`missing embedding for chunk ${idx}`);
        }
        const meta = (c.metadata ?? {}) as Record<string, unknown>;
        return {
          organizationId: orgId,
          documentId,
          chunkIndex: idx,
          content: c.content,
          embedding,
          tokenCount: estimateTokens(c.content),
          sourceTier: 'tenant_private' as const,
          meta,
        };
      });

      for (let i = 0; i < rows.length; i += INSERT_BATCH) {
        await tx.insert(documentChunks).values(rows.slice(i, i + INSERT_BATCH));
      }

      await tx
        .execute(sql`UPDATE ${documents} SET status='ready', updated_at=NOW() WHERE id=${documentId}::uuid AND organization_id=${orgId}::uuid`);
    });

    return { ok: true, chunksInserted: chunks.length };
  });
}
