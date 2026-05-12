import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { vineyards, type DbTx } from "@wined/db";
import { getAuth } from "@wined/auth";
import { audit } from "../../lib/audit.js";

export const vineyardsRoute = new Hono();

const CreateSchema = z.object({
  name: z.string().min(1),
  doId: z.string().uuid().optional(),
  plotCode: z.string().optional(),
  areaHa: z.union([z.string(), z.number()]).optional(),
  altitudeM: z.number().int().optional(),
  soilType: z.string().optional(),
  varieties: z.array(z.string()).optional(),
  meta: z.record(z.unknown()).optional(),
});

const UpdateSchema = CreateSchema.partial();

vineyardsRoute.get("/", async (c) => {
  const auth = getAuth(c);
  const db = c.get("db") as DbTx;
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
  const rows = await db
    .select()
    .from(vineyards)
    .where(eq(vineyards.organizationId, auth.orgId))
    .orderBy(desc(vineyards.createdAt))
    .limit(limit);
  return c.json({ rows });
});

vineyardsRoute.get("/:id", async (c) => {
  const auth = getAuth(c);
  const db = c.get("db") as DbTx;
  const id = c.req.param("id");
  const [row] = await db
    .select()
    .from(vineyards)
    .where(and(eq(vineyards.id, id), eq(vineyards.organizationId, auth.orgId)));
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json(row);
});

vineyardsRoute.post("/", async (c) => {
  const auth = getAuth(c);
  const parsed = CreateSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json(
      { error: "invalid_body", issues: parsed.error.issues },
      400,
    );
  }
  const db = c.get("db") as DbTx;
  const d = parsed.data;
  const [row] = await db
    .insert(vineyards)
    .values({
      organizationId: auth.orgId,
      name: d.name,
      ...(d.doId !== undefined ? { doId: d.doId } : {}),
      ...(d.plotCode !== undefined ? { plotCode: d.plotCode } : {}),
      ...(d.areaHa !== undefined ? { areaHa: String(d.areaHa) } : {}),
      ...(d.altitudeM !== undefined ? { altitudeM: d.altitudeM } : {}),
      ...(d.soilType !== undefined ? { soilType: d.soilType } : {}),
      ...(d.varieties !== undefined ? { varieties: d.varieties } : {}),
      ...(d.meta !== undefined ? { meta: d.meta } : {}),
    })
    .returning();
  if (!row) return c.json({ error: "insert_failed" }, 500);
  await audit(c, "cellar.vineyard.create", "vineyard", row.id, d);
  return c.json(row, 201);
});

vineyardsRoute.patch("/:id", async (c) => {
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
  if (d.name !== undefined) patch["name"] = d.name;
  if (d.doId !== undefined) patch["doId"] = d.doId;
  if (d.plotCode !== undefined) patch["plotCode"] = d.plotCode;
  if (d.areaHa !== undefined) patch["areaHa"] = String(d.areaHa);
  if (d.altitudeM !== undefined) patch["altitudeM"] = d.altitudeM;
  if (d.soilType !== undefined) patch["soilType"] = d.soilType;
  if (d.varieties !== undefined) patch["varieties"] = d.varieties;
  if (d.meta !== undefined) patch["meta"] = d.meta;

  const db = c.get("db") as DbTx;
  const [row] = await db
    .update(vineyards)
    .set(patch)
    .where(and(eq(vineyards.id, id), eq(vineyards.organizationId, auth.orgId)))
    .returning();
  if (!row) return c.json({ error: "not_found" }, 404);
  await audit(c, "cellar.vineyard.update", "vineyard", id, d);
  return c.json(row);
});

vineyardsRoute.delete("/:id", async (c) => {
  const auth = getAuth(c);
  const id = c.req.param("id");
  const db = c.get("db") as DbTx;
  const deleted = await db
    .delete(vineyards)
    .where(and(eq(vineyards.id, id), eq(vineyards.organizationId, auth.orgId)))
    .returning();
  if (deleted.length === 0) return c.json({ error: "not_found" }, 404);
  await audit(c, "cellar.vineyard.delete", "vineyard", id);
  return c.body(null, 204);
});
