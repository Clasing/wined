import { Hono } from "hono";
import { z } from "zod";
import { and, asc, eq, gte, isNotNull, isNull, lte } from "drizzle-orm";
import { scheduledOperations, type DbTx } from "@wined/db";
import { getAuth } from "@wined/auth";
import { audit } from "../../lib/audit.js";

export const scheduledOpsRoute = new Hono();

const CreateSchema = z.object({
  lotId: z.string().uuid().optional(),
  opType: z.string().min(1),
  dueAt: z.string().datetime(),
  notes: z.string().optional(),
});

const UpdateSchema = z
  .object({
    lotId: z.string().uuid().nullable().optional(),
    opType: z.string().min(1).optional(),
    dueAt: z.string().datetime().optional(),
    notes: z.string().nullable().optional(),
    doneOpId: z.string().uuid().nullable().optional(),
  })
  .strict();

scheduledOpsRoute.post("/", async (c) => {
  const auth = getAuth(c);
  const parsed = CreateSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json(
      { error: "invalid_body", issues: parsed.error.issues },
      400,
    );
  }
  const d = parsed.data;
  const db = c.get("db") as DbTx;
  const [row] = await db
    .insert(scheduledOperations)
    .values({
      organizationId: auth.orgId,
      opType: d.opType,
      dueAt: new Date(d.dueAt),
      ...(d.lotId !== undefined ? { lotId: d.lotId } : {}),
      ...(d.notes !== undefined ? { notes: d.notes } : {}),
    })
    .returning();
  if (!row) return c.json({ error: "insert_failed" }, 500);
  await audit(c, "cellar.scheduled_op.create", "scheduled_op", row.id, {
    opType: d.opType,
  });
  return c.json(row, 201);
});

scheduledOpsRoute.get("/", async (c) => {
  const auth = getAuth(c);
  const db = c.get("db") as DbTx;
  const from = c.req.query("from");
  const to = c.req.query("to");
  const status = c.req.query("status"); // "pending" | "done"
  const limit = Math.min(Number(c.req.query("limit") ?? 500), 1000);

  const conditions = [eq(scheduledOperations.organizationId, auth.orgId)];
  if (from) conditions.push(gte(scheduledOperations.dueAt, new Date(from)));
  if (to) conditions.push(lte(scheduledOperations.dueAt, new Date(to)));
  if (status === "pending")
    conditions.push(isNull(scheduledOperations.doneOpId));
  if (status === "done")
    conditions.push(isNotNull(scheduledOperations.doneOpId));

  const rows = await db
    .select()
    .from(scheduledOperations)
    .where(and(...conditions))
    .orderBy(asc(scheduledOperations.dueAt))
    .limit(limit);
  return c.json({ rows });
});

scheduledOpsRoute.get("/:id", async (c) => {
  const auth = getAuth(c);
  const id = c.req.param("id");
  const db = c.get("db") as DbTx;
  const [row] = await db
    .select()
    .from(scheduledOperations)
    .where(
      and(
        eq(scheduledOperations.id, id),
        eq(scheduledOperations.organizationId, auth.orgId),
      ),
    );
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json(row);
});

scheduledOpsRoute.patch("/:id", async (c) => {
  const auth = getAuth(c);
  const id = c.req.param("id");
  const parsed = UpdateSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json(
      { error: "invalid_body", issues: parsed.error.issues },
      400,
    );
  }
  const d = parsed.data;
  const patch: Record<string, unknown> = {};
  if (d.lotId !== undefined) patch["lotId"] = d.lotId;
  if (d.opType !== undefined) patch["opType"] = d.opType;
  if (d.dueAt !== undefined) patch["dueAt"] = new Date(d.dueAt);
  if (d.notes !== undefined) patch["notes"] = d.notes;
  if (d.doneOpId !== undefined) patch["doneOpId"] = d.doneOpId;

  if (Object.keys(patch).length === 0) {
    return c.json({ error: "empty_patch" }, 400);
  }

  const db = c.get("db") as DbTx;
  const [row] = await db
    .update(scheduledOperations)
    .set(patch)
    .where(
      and(
        eq(scheduledOperations.id, id),
        eq(scheduledOperations.organizationId, auth.orgId),
      ),
    )
    .returning();
  if (!row) return c.json({ error: "not_found" }, 404);
  await audit(c, "cellar.scheduled_op.update", "scheduled_op", id, d as Record<string, unknown>);
  return c.json(row);
});

scheduledOpsRoute.delete("/:id", async (c) => {
  const auth = getAuth(c);
  const id = c.req.param("id");
  const db = c.get("db") as DbTx;
  const deleted = await db
    .delete(scheduledOperations)
    .where(
      and(
        eq(scheduledOperations.id, id),
        eq(scheduledOperations.organizationId, auth.orgId),
      ),
    )
    .returning();
  if (deleted.length === 0) return c.json({ error: "not_found" }, 404);
  await audit(c, "cellar.scheduled_op.delete", "scheduled_op", id);
  return c.body(null, 204);
});
