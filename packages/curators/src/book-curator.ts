import { and, eq } from 'drizzle-orm';
import type { AgentDef } from '@wined/agents';
import {
  createDb,
  withTenant,
  documents,
  documentChunks,
} from '@wined/db';
import {
  chunkParseResult,
  parserForMime,
  createStorage,
} from '@wined/ingestion';
import { createEmbeddingProvider } from '@wined/embedding';
import type { CuratorImpl, CuratorRunArgs, CuratorRunError } from './curator.js';

export const bookCuratorAgent: AgentDef = {
  name: 'book-curator',
  pod: 'curator',
  model: 'sonnet',
  technical: false,
  systemPrompt: `You are the Book Curator (tenant-scope).

JOB: process a technical wine book uploaded by a tenant (PDF, DOCX).
- Chunk with book-aware mode: preserve chapter/section path and page number per chunk.
- Each chunk is citable by (book title, chapter, page).
- Embed and persist into document_chunks with source_tier='tenant_private'.
- Respect copyright: only the tenant who uploaded the book can retrieve its chunks.`,
  tools: [],
};

export type BookCuratorPayload = {
  documentId: string;
  orgId: string;
};

export const bookCurator: CuratorImpl = {
  agent: bookCuratorAgent,

  async run(args: CuratorRunArgs) {
    const payload = args.payload as BookCuratorPayload | undefined;
    if (!payload?.documentId || !payload?.orgId) {
      return {
        itemsProcessed: 0,
        errors: [
          {
            message:
              'book-curator requires payload.documentId and payload.orgId',
          },
        ],
      };
    }

    const dbUrl = process.env['DATABASE_URL'];
    if (!dbUrl) {
      return {
        itemsProcessed: 0,
        errors: [{ message: 'DATABASE_URL env var required' }],
      };
    }

    const db = createDb(dbUrl);
    const embedder = createEmbeddingProvider();
    const storage = createStorage();

    let chunksInserted = 0;
    const errors: CuratorRunError[] = [];

    try {
      // 1. Fetch document row (tenant-scoped)
      const [doc] = await db
        .select()
        .from(documents)
        .where(
          and(
            eq(documents.id, payload.documentId),
            eq(documents.organizationId, payload.orgId),
          ),
        );

      if (!doc) {
        return {
          itemsProcessed: 0,
          errors: [{ message: 'document not found' }],
        };
      }

      // Confirm it's a book
      if (doc.docType !== 'book') {
        return {
          itemsProcessed: 0,
          errors: [
            {
              message: `document docType=${doc.docType}, expected 'book'`,
            },
          ],
        };
      }

      // 2. Download from storage
      const { body, contentType } = await storage.get(doc.storageUrl);
      const mime = contentType ?? doc.mimeType;

      // 3. Parse
      const parser = parserForMime(mime);
      const parsed = await parser.parse(Buffer.from(body));

      // 4. Book-aware chunking
      const chunks = chunkParseResult(parsed, {
        bookAware: true,
        chunkSizeTokens: 700,
        overlapTokens: 80,
      });

      if (chunks.length === 0) {
        return { itemsProcessed: 0, errors: [] };
      }

      // 5. Embed in batches
      const BATCH = 96;
      const embeddings: number[][] = [];
      for (let i = 0; i < chunks.length; i += BATCH) {
        const slice = chunks.slice(i, i + BATCH);
        const embs = await embedder.embed(
          slice.map((c) => c.content),
          'document',
        );
        embeddings.push(...embs);
      }

      // 6. Bulk insert with RLS
      await withTenant(db, payload.orgId, async (tx) => {
        const rows = chunks.map((c, idx) => {
          const emb = embeddings[idx];
          if (!emb) {
            throw new Error(`missing embedding for chunk ${idx}`);
          }
          const meta: Record<string, unknown> = {
            ...c.metadata,
            bookAware: true,
          };
          return {
            documentId: doc.id,
            organizationId: payload.orgId,
            chunkIndex: idx,
            content: c.content,
            tokenCount: c.tokenCount,
            embedding: emb,
            ...(c.metadata.pageNumber !== undefined
              ? { pageNumber: c.metadata.pageNumber }
              : {}),
            ...(c.metadata.sectionPath !== undefined
              ? { sectionPath: c.metadata.sectionPath }
              : {}),
            meta,
            sourceTier: 'tenant_private' as const,
          };
        });

        const INSERT_BATCH = 500;
        for (let i = 0; i < rows.length; i += INSERT_BATCH) {
          await tx
            .insert(documentChunks)
            .values(rows.slice(i, i + INSERT_BATCH));
        }
      });

      chunksInserted = chunks.length;
    } catch (err) {
      const e = err as Error;
      errors.push(
        e.stack !== undefined
          ? { message: e.message, stack: e.stack }
          : { message: e.message },
      );
    }

    return { itemsProcessed: chunksInserted, errors };
  },
};
