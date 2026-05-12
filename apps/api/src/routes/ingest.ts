import { Hono } from "hono";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { documents, auditLog, type DbTx } from "@wined/db";
import { getAuth } from "@wined/auth";
import {
  ingestionClassifyQueue,
  createStorage,
  defaultJobOpts,
} from "@wined/ingestion";
import { track, ANALYTICS_EVENTS } from "@wined/analytics";
import { audit } from "../lib/audit.js";

export const ingestRoute = new Hono();

// ───────────────────────────────────────────────────────────────────────────
// Step 30 — Upload + enqueue ingestion classify job
// ───────────────────────────────────────────────────────────────────────────

const uploadUrlSchema = z.object({
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
});

ingestRoute.post("/upload-url", async (c) => {
  const auth = getAuth(c);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = uploadUrlSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  }
  const { fileName, mimeType } = parsed.data;

  const storage = createStorage();
  const key = `tenants/${auth.orgId}/uploads/${Date.now()}-${fileName}`;
  const uploadUrl = await storage.signPut(key, 600, mimeType);

  return c.json({ uploadUrl, storageKey: key });
});

const confirmSchema = z.object({
  storageKey: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  contentHash: z.string().min(1),
  workspaceId: z.string().uuid().optional(),
  docType: z
    .enum([
      "tasting_note",
      "wine_list",
      "invoice",
      "technical_sheet",
      "vinification_log",
      "compliance_doc",
      "lab_report",
      "contract",
      "book",
      "regulation",
      "do_pliego",
      "menu",
      "sales_report",
      "generic",
    ])
    .optional(),
});

ingestRoute.post("/confirm", async (c) => {
  const auth = getAuth(c);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = confirmSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  }
  const {
    storageKey,
    fileName,
    mimeType,
    sizeBytes,
    contentHash,
    workspaceId,
    docType,
  } = parsed.data;

  const db = c.get("db") as DbTx;

  const [doc] = await db
    .insert(documents)
    .values({
      organizationId: auth.orgId,
      workspaceId: workspaceId ?? null,
      uploadedBy: auth.userId,
      filename: fileName,
      storageUrl: storageKey,
      mimeType,
      sizeBytes,
      contentHash,
      docType: docType ?? "generic",
      status: "uploaded",
    })
    .returning({ id: documents.id });

  if (!doc) {
    return c.json({ error: "insert_failed" }, 500);
  }

  await ingestionClassifyQueue.add(
    "classify",
    {
      documentId: doc.id,
      orgId: auth.orgId,
      storageKey,
      fileName,
      mimeType,
    },
    defaultJobOpts,
  );

  await audit(c, "document_uploaded", "document", doc.id, {
    fileName,
    mimeType,
    sizeBytes,
  });

  await track({
    event: ANALYTICS_EVENTS.DOCUMENT_UPLOADED,
    orgId: auth.orgId,
    userId: auth.userId,
    properties: {
      document_id: doc.id,
      file_name: fileName,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      doc_type: docType ?? "generic",
    },
  });

  return c.json({ documentId: doc.id, status: "uploaded" });
});

ingestRoute.get("/:id/status", async (c) => {
  const auth = getAuth(c);
  const db = c.get("db") as DbTx;
  const id = c.req.param("id");

  const rows = await db
    .select({
      id: documents.id,
      status: documents.status,
      updatedAt: documents.updatedAt,
    })
    .from(documents)
    .where(
      and(eq(documents.id, id), eq(documents.organizationId, auth.orgId)),
    );
  const doc = rows[0];
  if (!doc) return c.json({ error: "not_found" }, 404);
  return c.json({ id: doc.id, status: doc.status, updatedAt: doc.updatedAt });
});

// ───────────────────────────────────────────────────────────────────────────
// Step 27 — PII consent gate (preserved from ingest-pii.ts)
// ───────────────────────────────────────────────────────────────────────────

const piiConsentSchema = z.object({
  decision: z.enum(["consent", "redact", "cancel"]),
});

ingestRoute.post("/:id/pii-consent", async (c) => {
  const auth = getAuth(c);
  const id = c.req.param("id");

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const parsed = piiConsentSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_body", issues: parsed.error.issues },
      400,
    );
  }
  const { decision } = parsed.data;

  const db = c.get("db") as DbTx;

  const newStatus =
    decision === "cancel"
      ? ("quarantined_pii" as const)
      : ("parsing" as const);

  const updateSet: {
    status: typeof newStatus;
    updatedAt: Date;
    piiConsentUserId?: string;
    piiConsentAt?: Date;
  } = {
    status: newStatus,
    updatedAt: new Date(),
  };

  if (decision === "consent" || decision === "redact") {
    updateSet.piiConsentUserId = auth.userId;
    updateSet.piiConsentAt = new Date();
  }

  const updated = await db
    .update(documents)
    .set(updateSet)
    .where(
      and(eq(documents.id, id), eq(documents.organizationId, auth.orgId)),
    )
    .returning({ id: documents.id });

  if (updated.length === 0) {
    return c.json({ error: "not_found" }, 404);
  }

  await db.insert(auditLog).values({
    organizationId: auth.orgId,
    userId: auth.userId,
    action: "pii_consent_decision",
    entity: "document",
    entityId: id,
    diff: { decision, status: newStatus },
  });

  return c.json({ ok: true, newStatus });
});
