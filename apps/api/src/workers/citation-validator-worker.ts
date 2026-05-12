import { sql } from "drizzle-orm";
import { createDb } from "@wined/db";
import { makeWorker, type CitationValidatorJob } from "@wined/ingestion";
import { env } from "../env.js";

/**
 * Citation rota detection cron (Edge 16).
 *
 * Citation identifiers stored in `messages.citations` (jsonb array of strings).
 * Each id may reference:
 *   - documents.id (uuid)
 *   - document_chunks.id (uuid)
 *   - regulatory_corpus.id (uuid)  OR  reg_code-article_ref textual key
 *
 * When at least one citation id no longer resolves, the message is marked with
 * `messages.obsolete_reason = 'broken_citation'`.
 */

export type BrokenCitationResult = {
  scanned: number;
  brokenFound: number;
  messagesUpdated: number;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function runCitationValidator(
  opts: { lookbackDays?: number; databaseUrl?: string } = {},
): Promise<BrokenCitationResult> {
  const db = createDb(opts.databaseUrl ?? env.DATABASE_URL);
  const lookback = opts.lookbackDays ?? 30;
  const since = new Date(Date.now() - lookback * 86400 * 1000);

  const result = await db.execute(sql`
    SELECT id::text AS id, citations
    FROM messages
    WHERE created_at >= ${since}
      AND citations IS NOT NULL
      AND jsonb_array_length(citations) > 0
      AND (obsolete_reason IS NULL OR obsolete_reason <> 'broken_citation')
  `);

  const rows = (result as unknown as { rows?: unknown[] }).rows ?? (result as unknown as unknown[]);

  let scanned = 0;
  let brokenFound = 0;
  let messagesUpdated = 0;

  for (const raw of rows as Array<{ id: string; citations: unknown }>) {
    scanned++;
    const citationIds: string[] = Array.isArray(raw.citations)
      ? (raw.citations as unknown[]).filter(
          (c): c is string => typeof c === "string",
        )
      : [];

    if (citationIds.length === 0) continue;

    const broken: string[] = [];

    for (const cid of citationIds) {
      let exists = false;

      if (UUID_RE.test(cid)) {
        const docCheck = await db.execute(
          sql`SELECT 1 FROM documents WHERE id = ${cid}::uuid LIMIT 1`,
        );
        const docRows =
          (docCheck as unknown as { rows?: unknown[] }).rows ??
          (docCheck as unknown as unknown[]);
        if ((docRows as unknown[]).length > 0) {
          exists = true;
        }

        if (!exists) {
          const chunkCheck = await db.execute(
            sql`SELECT 1 FROM document_chunks WHERE id = ${cid}::uuid LIMIT 1`,
          );
          const chunkRows =
            (chunkCheck as unknown as { rows?: unknown[] }).rows ??
            (chunkCheck as unknown as unknown[]);
          if ((chunkRows as unknown[]).length > 0) {
            exists = true;
          }
        }

        if (!exists) {
          const regCheck = await db.execute(
            sql`SELECT 1 FROM regulatory_corpus WHERE id = ${cid}::uuid LIMIT 1`,
          );
          const regRows =
            (regCheck as unknown as { rows?: unknown[] }).rows ??
            (regCheck as unknown as unknown[]);
          if ((regRows as unknown[]).length > 0) {
            exists = true;
          }
        }
      } else {
        // Textual key (reg_code or reg_code-article_ref).
        const regTextCheck = await db.execute(sql`
          SELECT 1
          FROM regulatory_corpus
          WHERE reg_code = ${cid}
             OR reg_code || '-' || COALESCE(article_ref, '') = ${cid}
          LIMIT 1
        `);
        const regTextRows =
          (regTextCheck as unknown as { rows?: unknown[] }).rows ??
          (regTextCheck as unknown as unknown[]);
        if ((regTextRows as unknown[]).length > 0) {
          exists = true;
        }
      }

      if (!exists) broken.push(cid);
    }

    if (broken.length > 0) {
      brokenFound += broken.length;
      await db.execute(sql`
        UPDATE messages
        SET obsolete_reason = 'broken_citation'
        WHERE id = ${raw.id}::uuid
      `);
      messagesUpdated++;
    }
  }

  return { scanned, brokenFound, messagesUpdated };
}

export function startCitationValidatorWorker(): ReturnType<
  typeof makeWorker<CitationValidatorJob>
> {
  return makeWorker<CitationValidatorJob>("citation-validator", async () => {
    return runCitationValidator({ lookbackDays: 30 });
  });
}

// Allow direct execution: `node dist/workers/citation-validator-worker.js`.
if (import.meta.url === `file://${process.argv[1]}`) {
  runCitationValidator()
    .then((r) => {
      // eslint-disable-next-line no-console
      console.log("[citation-validator-cron]", r);
      process.exit(0);
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[citation-validator-cron] fatal", err);
      process.exit(1);
    });
}
