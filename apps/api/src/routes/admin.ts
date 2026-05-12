import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import { auditLog, curatorRuns, corpusConflicts, type DbTx } from "@wined/db";
import { getAuth } from "@wined/auth";

const VALID_CURATOR_NAMES = [
  "regulation",
  "do",
  "book",
  "catalog",
  "reviewer",
] as const;
type CuratorName = (typeof VALID_CURATOR_NAMES)[number];

export const adminRoute = new Hono();

const querySchema = z.object({
  userId: z.string().uuid().optional(),
  action: z.string().optional(),
  entity: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

function buildConditions(
  orgId: string,
  q: {
    userId?: string | undefined;
    action?: string | undefined;
    entity?: string | undefined;
    from?: string | undefined;
    to?: string | undefined;
  },
): SQL[] {
  const conditions: SQL[] = [eq(auditLog.organizationId, orgId)];
  if (q.userId) conditions.push(eq(auditLog.userId, q.userId));
  if (q.action) conditions.push(eq(auditLog.action, q.action));
  if (q.entity) conditions.push(eq(auditLog.entity, q.entity));
  if (q.from) conditions.push(gte(auditLog.createdAt, new Date(q.from)));
  if (q.to) conditions.push(lte(auditLog.createdAt, new Date(q.to)));
  return conditions;
}

adminRoute.get("/audit", async (c) => {
  const auth = getAuth(c);
  if (auth.role !== "admin") return c.json({ error: "forbidden" }, 403);

  const parsed = querySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json(
      { error: "invalid_query", issues: parsed.error.issues },
      400,
    );
  }
  const q = parsed.data;
  const db = c.get("db") as DbTx;

  const conditions = buildConditions(auth.orgId, q);
  const rows = await db
    .select()
    .from(auditLog)
    .where(and(...conditions))
    .orderBy(desc(auditLog.createdAt))
    .limit(q.limit);

  return c.json({ rows });
});

adminRoute.get("/audit.csv", async (c) => {
  const auth = getAuth(c);
  if (auth.role !== "admin") return c.json({ error: "forbidden" }, 403);

  const db = c.get("db") as DbTx;
  const rows = await db
    .select()
    .from(auditLog)
    .where(eq(auditLog.organizationId, auth.orgId))
    .orderBy(desc(auditLog.createdAt))
    .limit(5000);

  const headers = [
    "id",
    "created_at",
    "user_id",
    "action",
    "entity",
    "entity_id",
  ];
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.id,
        r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
        r.userId,
        r.action,
        r.entity,
        r.entityId,
      ]
        .map((v) => JSON.stringify(v ?? ""))
        .join(","),
    );
  }

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="audit.csv"',
    },
  });
});

// POST /v1/admin/curate/:name — trigger curator on-demand (admin only).
// Enqueues via BullMQ; does not execute inline (the curator worker respects budget caps).
adminRoute.post("/curate/:name", async (c) => {
  const auth = getAuth(c);
  if (auth.role !== "admin") return c.json({ error: "forbidden" }, 403);

  const name = c.req.param("name");
  if (!(VALID_CURATOR_NAMES as readonly string[]).includes(name)) {
    return c.json(
      { error: "invalid_curator", valid: VALID_CURATOR_NAMES },
      400,
    );
  }
  const curatorName = name as CuratorName;

  const body = (await c.req.json().catch(() => ({}))) as {
    payload?: Record<string, unknown>;
  };
  const payload = body.payload ?? {};

  const { curatorQueue } = await import("@wined/ingestion");
  const job = await curatorQueue.add(`curator.${curatorName}`, {
    curatorName,
    trigger: "manual",
    orgId: auth.orgId,
    payload,
  });

  return c.json({ jobId: job.id, status: "queued", curator: curatorName });
});

// GET /v1/admin/curator-runs — list recent runs
adminRoute.get("/curator-runs", async (c) => {
  const auth = getAuth(c);
  if (auth.role !== "admin") return c.json({ error: "forbidden" }, 403);

  const db = c.get("db") as DbTx;
  const limitRaw = Number(c.req.query("limit") ?? 50);
  const limit = Math.min(
    Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 50,
    200,
  );

  const rows = await db
    .select()
    .from(curatorRuns)
    .orderBy(desc(curatorRuns.startedAt))
    .limit(limit);

  return c.json({ rows });
});

// GET /v1/admin/hallucinations — list reported hallucinations for admin review
adminRoute.get("/hallucinations", async (c) => {
  const auth = getAuth(c);
  if (auth.role !== "admin") return c.json({ error: "forbidden" }, 403);

  const db = c.get("db") as DbTx;
  const rows = await db
    .select()
    .from(corpusConflicts)
    .where(eq(corpusConflicts.topic, "hallucination_reported"))
    .orderBy(desc(corpusConflicts.createdAt))
    .limit(200);

  return c.json({ rows });
});

// POST /v1/admin/hallucinations/:id/resolve — mark a reported hallucination resolved
adminRoute.post("/hallucinations/:id/resolve", async (c) => {
  const auth = getAuth(c);
  if (auth.role !== "admin") return c.json({ error: "forbidden" }, 403);

  const id = c.req.param("id");
  const body = (await c.req.json().catch(() => ({}))) as { notes?: string };
  const db = c.get("db") as DbTx;

  const [existing] = await db
    .select()
    .from(corpusConflicts)
    .where(eq(corpusConflicts.id, id))
    .limit(1);

  if (!existing) return c.json({ error: "not_found" }, 404);

  const notes = body.notes ?? null;
  const updatedResolution = notes
    ? `${existing.resolution}\n[admin notes] ${notes}`
    : existing.resolution;

  await db
    .update(corpusConflicts)
    .set({ status: "resolved", resolution: updatedResolution })
    .where(eq(corpusConflicts.id, id));

  return c.json({ ok: true });
});

// GET /v1/admin/curator-runs/:id — detail single run
adminRoute.get("/curator-runs/:id", async (c) => {
  const auth = getAuth(c);
  if (auth.role !== "admin") return c.json({ error: "forbidden" }, 403);

  const id = c.req.param("id");
  const db = c.get("db") as DbTx;

  const [run] = await db
    .select()
    .from(curatorRuns)
    .where(eq(curatorRuns.id, id))
    .limit(1);

  if (!run) return c.json({ error: "not_found" }, 404);
  return c.json(run);
});
