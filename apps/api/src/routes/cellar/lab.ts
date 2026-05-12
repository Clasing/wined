import { Hono } from "hono";
import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import {
  documentChunks,
  documents,
  type DbTx,
} from "@wined/db";
import { getAuth } from "@wined/auth";
import { ingestLabAnalysis } from "@wined/agents";
import { LLMGateway } from "@wined/llm-gateway";
import { audit } from "../../lib/audit.js";
import { env } from "../../env.js";

export const labRoute = new Hono();

let gateway: LLMGateway | null = null;
function getGateway(): LLMGateway {
  if (!gateway) {
    gateway = new LLMGateway({
      anthropicKey: env.ANTHROPIC_API_KEY,
      redisUrl: env.REDIS_URL,
    });
  }
  return gateway;
}

const IngestSchema = z.object({
  documentId: z.string().uuid(),
  lotId: z.string().uuid().optional(),
});

labRoute.post("/ingest", async (c) => {
  const auth = getAuth(c);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const parsed = IngestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  }

  const db = c.get("db") as DbTx;

  const docs = await db
    .select({ id: documents.id })
    .from(documents)
    .where(
      and(
        eq(documents.id, parsed.data.documentId),
        eq(documents.organizationId, auth.orgId),
      ),
    );
  const docRow = docs[0];
  if (!docRow) {
    return c.json({ error: "document_not_found" }, 404);
  }

  const chunks = await db
    .select({ content: documentChunks.content })
    .from(documentChunks)
    .where(
      and(
        eq(documentChunks.documentId, docRow.id),
        eq(documentChunks.organizationId, auth.orgId),
      ),
    )
    .orderBy(asc(documentChunks.chunkIndex));
  const text = chunks.map((r) => r.content).join("\n\n");

  const result = await ingestLabAnalysis({
    tx: db,
    gateway: getGateway(),
    orgId: auth.orgId,
    documentText: text,
    documentId: docRow.id,
    ...(parsed.data.lotId ? { lotId: parsed.data.lotId } : {}),
  });

  await audit(c, "cellar.lab_analysis.ingest", "lab_analysis", result.analysisId, {
    lotMatched: result.lotMatched,
    flags: result.flags,
  });

  return c.json(result);
});
