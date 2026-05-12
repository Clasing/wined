import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { wineLots, lotOperations, type DbTx } from "@wined/db";
import { getAuth } from "@wined/auth";
import { audit } from "../../lib/audit.js";

export const lotsRoute = new Hono();

const CreateSchema = z.object({
  code: z.string().min(1),
  vintageId: z.string().uuid().optional(),
  vineyardId: z.string().uuid().optional(),
  depositId: z.string().uuid().optional(),
  doId: z.string().uuid().optional(),
  varietyBlend: z.unknown().optional(),
  volumeL: z.union([z.string(), z.number()]).optional(),
  status: z.string().optional(),
  startedAt: z.string().datetime().optional(),
  bottledAt: z.string().datetime().optional(),
  meta: z.record(z.unknown()).optional(),
});

const UpdateSchema = CreateSchema.partial();

lotsRoute.get("/", async (c) => {
  const auth = getAuth(c);
  const db = c.get("db") as DbTx;
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
  const rows = await db
    .select()
    .from(wineLots)
    .where(eq(wineLots.organizationId, auth.orgId))
    .orderBy(desc(wineLots.createdAt))
    .limit(limit);
  return c.json({ rows });
});

lotsRoute.get("/:id", async (c) => {
  const auth = getAuth(c);
  const db = c.get("db") as DbTx;
  const id = c.req.param("id");
  const [row] = await db
    .select()
    .from(wineLots)
    .where(and(eq(wineLots.id, id), eq(wineLots.organizationId, auth.orgId)));
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json(row);
});

lotsRoute.post("/", async (c) => {
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
    .insert(wineLots)
    .values({
      organizationId: auth.orgId,
      code: d.code,
      ...(d.vintageId !== undefined ? { vintageId: d.vintageId } : {}),
      ...(d.vineyardId !== undefined ? { vineyardId: d.vineyardId } : {}),
      ...(d.depositId !== undefined ? { depositId: d.depositId } : {}),
      ...(d.doId !== undefined ? { doId: d.doId } : {}),
      ...(d.varietyBlend !== undefined
        ? { varietyBlend: d.varietyBlend }
        : {}),
      ...(d.volumeL !== undefined ? { volumeL: String(d.volumeL) } : {}),
      ...(d.status !== undefined ? { status: d.status } : {}),
      ...(d.startedAt !== undefined
        ? { startedAt: new Date(d.startedAt) }
        : {}),
      ...(d.bottledAt !== undefined
        ? { bottledAt: new Date(d.bottledAt) }
        : {}),
      ...(d.meta !== undefined ? { meta: d.meta } : {}),
    })
    .returning();
  if (!row) return c.json({ error: "insert_failed" }, 500);
  await audit(c, "cellar.lot.create", "lot", row.id, d as Record<string, unknown>);
  return c.json(row, 201);
});

lotsRoute.patch("/:id", async (c) => {
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
  if (d.code !== undefined) patch["code"] = d.code;
  if (d.vintageId !== undefined) patch["vintageId"] = d.vintageId;
  if (d.vineyardId !== undefined) patch["vineyardId"] = d.vineyardId;
  if (d.depositId !== undefined) patch["depositId"] = d.depositId;
  if (d.doId !== undefined) patch["doId"] = d.doId;
  if (d.varietyBlend !== undefined) patch["varietyBlend"] = d.varietyBlend;
  if (d.volumeL !== undefined) patch["volumeL"] = String(d.volumeL);
  if (d.status !== undefined) patch["status"] = d.status;
  if (d.startedAt !== undefined) patch["startedAt"] = new Date(d.startedAt);
  if (d.bottledAt !== undefined) patch["bottledAt"] = new Date(d.bottledAt);
  if (d.meta !== undefined) patch["meta"] = d.meta;

  const db = c.get("db") as DbTx;
  const [row] = await db
    .update(wineLots)
    .set(patch)
    .where(and(eq(wineLots.id, id), eq(wineLots.organizationId, auth.orgId)))
    .returning();
  if (!row) return c.json({ error: "not_found" }, 404);
  await audit(c, "cellar.lot.update", "lot", id, d as Record<string, unknown>);
  return c.json(row);
});

// ===== LOT OPERATIONS (timeline) =====
const OpCreateSchema = z.object({
  opType: z.string().min(1),
  performedAt: z.string().datetime().optional(),
  inputs: z.record(z.unknown()).optional(),
  notes: z.string().optional(),
});

lotsRoute.get("/:id/operations", async (c) => {
  const auth = getAuth(c);
  const id = c.req.param("id");
  const db = c.get("db") as DbTx;
  const rows = await db
    .select()
    .from(lotOperations)
    .where(
      and(
        eq(lotOperations.lotId, id),
        eq(lotOperations.organizationId, auth.orgId),
      ),
    )
    .orderBy(desc(lotOperations.performedAt))
    .limit(500);
  return c.json({ rows });
});

lotsRoute.post("/:id/operations", async (c) => {
  const auth = getAuth(c);
  const lotId = c.req.param("id");
  const parsed = OpCreateSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json(
      { error: "invalid_body", issues: parsed.error.issues },
      400,
    );
  }
  const d = parsed.data;
  const db = c.get("db") as DbTx;
  const [row] = await db
    .insert(lotOperations)
    .values({
      organizationId: auth.orgId,
      lotId,
      opType: d.opType,
      inputs: d.inputs ?? {},
      ...(d.performedAt !== undefined
        ? { performedAt: new Date(d.performedAt) }
        : {}),
      ...(d.notes !== undefined ? { notes: d.notes } : {}),
    })
    .returning();
  if (!row) return c.json({ error: "insert_failed" }, 500);
  await audit(c, "cellar.lot_op.create", "lot_operation", row.id, {
    opType: d.opType,
    lotId,
  });
  return c.json(row, 201);
});

lotsRoute.delete("/:id", async (c) => {
  const auth = getAuth(c);
  const id = c.req.param("id");
  const db = c.get("db") as DbTx;
  const deleted = await db
    .delete(wineLots)
    .where(and(eq(wineLots.id, id), eq(wineLots.organizationId, auth.orgId)))
    .returning();
  if (deleted.length === 0) return c.json({ error: "not_found" }, 404);
  await audit(c, "cellar.lot.delete", "lot", id);
  return c.body(null, 204);
});
