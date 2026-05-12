import { Hono } from "hono";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { deposits, type DbTx } from "@wined/db";
import { getAuth } from "@wined/auth";
import { audit } from "../../lib/audit.js";

export const depositsRoute = new Hono();

const CreateSchema = z.object({
  code: z.string().min(1),
  capacityL: z.union([z.string(), z.number()]).optional(),
  material: z.string().optional(),
  status: z.string().optional(),
  meta: z.record(z.unknown()).optional(),
});

const UpdateSchema = CreateSchema.partial();

depositsRoute.get("/", async (c) => {
  const auth = getAuth(c);
  const db = c.get("db") as DbTx;
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
  const rows = await db
    .select()
    .from(deposits)
    .where(eq(deposits.organizationId, auth.orgId))
    .limit(limit);
  return c.json({ rows });
});

depositsRoute.get("/:id", async (c) => {
  const auth = getAuth(c);
  const db = c.get("db") as DbTx;
  const id = c.req.param("id");
  const [row] = await db
    .select()
    .from(deposits)
    .where(and(eq(deposits.id, id), eq(deposits.organizationId, auth.orgId)));
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json(row);
});

depositsRoute.post("/", async (c) => {
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
    .insert(deposits)
    .values({
      organizationId: auth.orgId,
      code: d.code,
      ...(d.capacityL !== undefined ? { capacityL: String(d.capacityL) } : {}),
      ...(d.material !== undefined ? { material: d.material } : {}),
      ...(d.status !== undefined ? { status: d.status } : {}),
      ...(d.meta !== undefined ? { meta: d.meta } : {}),
    })
    .returning();
  if (!row) return c.json({ error: "insert_failed" }, 500);
  await audit(c, "cellar.deposit.create", "deposit", row.id, d);
  return c.json(row, 201);
});

depositsRoute.patch("/:id", async (c) => {
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
  if (d.capacityL !== undefined) patch["capacityL"] = String(d.capacityL);
  if (d.material !== undefined) patch["material"] = d.material;
  if (d.status !== undefined) patch["status"] = d.status;
  if (d.meta !== undefined) patch["meta"] = d.meta;

  const db = c.get("db") as DbTx;
  const [row] = await db
    .update(deposits)
    .set(patch)
    .where(and(eq(deposits.id, id), eq(deposits.organizationId, auth.orgId)))
    .returning();
  if (!row) return c.json({ error: "not_found" }, 404);
  await audit(c, "cellar.deposit.update", "deposit", id, d);
  return c.json(row);
});

depositsRoute.delete("/:id", async (c) => {
  const auth = getAuth(c);
  const id = c.req.param("id");
  const db = c.get("db") as DbTx;
  const deleted = await db
    .delete(deposits)
    .where(and(eq(deposits.id, id), eq(deposits.organizationId, auth.orgId)))
    .returning();
  if (deleted.length === 0) return c.json({ error: "not_found" }, 404);
  await audit(c, "cellar.deposit.delete", "deposit", id);
  return c.body(null, 204);
});
