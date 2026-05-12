import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { vintages, type DbTx } from "@wined/db";
import { getAuth } from "@wined/auth";
import { audit } from "../../lib/audit.js";

export const vintagesRoute = new Hono();

const CreateSchema = z.object({
  year: z.number().int(),
  summary: z.string().optional(),
  weatherNotes: z.string().optional(),
  closedAt: z.string().datetime().optional(),
  meta: z.record(z.unknown()).optional(),
});

const UpdateSchema = CreateSchema.partial();

vintagesRoute.get("/", async (c) => {
  const auth = getAuth(c);
  const db = c.get("db") as DbTx;
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
  const rows = await db
    .select()
    .from(vintages)
    .where(eq(vintages.organizationId, auth.orgId))
    .orderBy(desc(vintages.year))
    .limit(limit);
  return c.json({ rows });
});

vintagesRoute.get("/:id", async (c) => {
  const auth = getAuth(c);
  const db = c.get("db") as DbTx;
  const id = c.req.param("id");
  const [row] = await db
    .select()
    .from(vintages)
    .where(and(eq(vintages.id, id), eq(vintages.organizationId, auth.orgId)));
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json(row);
});

vintagesRoute.post("/", async (c) => {
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
    .insert(vintages)
    .values({
      organizationId: auth.orgId,
      year: d.year,
      ...(d.summary !== undefined ? { summary: d.summary } : {}),
      ...(d.weatherNotes !== undefined ? { weatherNotes: d.weatherNotes } : {}),
      ...(d.closedAt !== undefined ? { closedAt: new Date(d.closedAt) } : {}),
      ...(d.meta !== undefined ? { meta: d.meta } : {}),
    })
    .returning();
  if (!row) return c.json({ error: "insert_failed" }, 500);
  await audit(c, "cellar.vintage.create", "vintage", row.id, d);
  return c.json(row, 201);
});

vintagesRoute.patch("/:id", async (c) => {
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
  if (d.year !== undefined) patch["year"] = d.year;
  if (d.summary !== undefined) patch["summary"] = d.summary;
  if (d.weatherNotes !== undefined) patch["weatherNotes"] = d.weatherNotes;
  if (d.closedAt !== undefined) patch["closedAt"] = new Date(d.closedAt);
  if (d.meta !== undefined) patch["meta"] = d.meta;

  const db = c.get("db") as DbTx;
  const [row] = await db
    .update(vintages)
    .set(patch)
    .where(and(eq(vintages.id, id), eq(vintages.organizationId, auth.orgId)))
    .returning();
  if (!row) return c.json({ error: "not_found" }, 404);
  await audit(c, "cellar.vintage.update", "vintage", id, d);
  return c.json(row);
});

vintagesRoute.delete("/:id", async (c) => {
  const auth = getAuth(c);
  const id = c.req.param("id");
  const db = c.get("db") as DbTx;
  const deleted = await db
    .delete(vintages)
    .where(and(eq(vintages.id, id), eq(vintages.organizationId, auth.orgId)))
    .returning();
  if (deleted.length === 0) return c.json({ error: "not_found" }, 404);
  await audit(c, "cellar.vintage.delete", "vintage", id);
  return c.body(null, 204);
});
