import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import { grapeIntakes, type DbTx } from "@wined/db";
import { getAuth } from "@wined/auth";
import { audit } from "../../lib/audit.js";

export const intakesRoute = new Hono();

const CreateSchema = z.object({
  vineyardId: z.string().uuid().optional(),
  vintageId: z.string().uuid().optional(),
  variety: z.string().min(1),
  receivedAt: z.string().datetime().optional(),
  weightKg: z.number().min(0),
  baume: z.number().min(0).max(25).optional(),
  ph: z.number().min(2).max(5).optional(),
  sanityScore: z.number().int().min(0).max(10).optional(),
  meta: z.record(z.unknown()).optional(),
});

type IntakeFlag = {
  parameter: string;
  value: number;
  expected_range: [number, number];
  severity: "info" | "warning";
};

intakesRoute.get("/", async (c) => {
  const auth = getAuth(c);
  const db = c.get("db") as DbTx;
  const limit = Math.min(Number(c.req.query("limit") ?? 100), 500);
  const vintageId = c.req.query("vintageId");
  const vineyardId = c.req.query("vineyardId");

  const conditions = [eq(grapeIntakes.organizationId, auth.orgId)];
  if (vintageId) conditions.push(eq(grapeIntakes.vintageId, vintageId));
  if (vineyardId) conditions.push(eq(grapeIntakes.vineyardId, vineyardId));

  const rows = await db
    .select()
    .from(grapeIntakes)
    .where(and(...conditions))
    .orderBy(desc(grapeIntakes.receivedAt))
    .limit(limit);
  return c.json({ rows });
});

intakesRoute.post("/", async (c) => {
  const auth = getAuth(c);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_body", issues: parsed.error.issues },
      400,
    );
  }
  const d = parsed.data;
  const db = c.get("db") as DbTx;

  // Compute z-score flags against historical intakes for same vineyard + variety
  const flags: IntakeFlag[] = [];
  if (d.vineyardId) {
    const statsResult = await db.execute(sql`
      SELECT
        AVG(CAST(baume AS numeric)) AS avg_baume,
        STDDEV(CAST(baume AS numeric)) AS std_baume,
        AVG(CAST(ph AS numeric)) AS avg_ph,
        STDDEV(CAST(ph AS numeric)) AS std_ph,
        COUNT(*) AS n
      FROM grape_intakes
      WHERE organization_id = ${auth.orgId}::uuid
        AND vineyard_id = ${d.vineyardId}::uuid
        AND variety = ${d.variety}
        AND baume IS NOT NULL
    `);
    const rows =
      (statsResult as { rows?: Array<Record<string, unknown>> }).rows ??
      (statsResult as unknown as Array<Record<string, unknown>>);
    const stats = Array.isArray(rows) ? rows[0] : undefined;
    if (stats && Number(stats["n"]) >= 3) {
      const avgB = Number(stats["avg_baume"]);
      const stdB = Number(stats["std_baume"]);
      const avgP = Number(stats["avg_ph"]);
      const stdP = Number(stats["std_ph"]);
      if (d.baume !== undefined && stdB > 0) {
        const z = (d.baume - avgB) / stdB;
        if (Math.abs(z) > 2) {
          flags.push({
            parameter: "baume",
            value: d.baume,
            expected_range: [avgB - 2 * stdB, avgB + 2 * stdB],
            severity: Math.abs(z) > 3 ? "warning" : "info",
          });
        }
      }
      if (d.ph !== undefined && stdP > 0) {
        const z = (d.ph - avgP) / stdP;
        if (Math.abs(z) > 2) {
          flags.push({
            parameter: "ph",
            value: d.ph,
            expected_range: [avgP - 2 * stdP, avgP + 2 * stdP],
            severity: Math.abs(z) > 3 ? "warning" : "info",
          });
        }
      }
    }
  }

  const values: Record<string, unknown> = {
    organizationId: auth.orgId,
    variety: d.variety,
    weightKg: String(d.weightKg),
    outOfHistoricalFlags: flags,
  };
  if (d.vineyardId !== undefined) values["vineyardId"] = d.vineyardId;
  if (d.vintageId !== undefined) values["vintageId"] = d.vintageId;
  if (d.receivedAt !== undefined) values["receivedAt"] = new Date(d.receivedAt);
  if (d.baume !== undefined) values["baume"] = String(d.baume);
  if (d.ph !== undefined) values["ph"] = String(d.ph);
  if (d.sanityScore !== undefined) values["sanityScore"] = d.sanityScore;
  if (d.meta !== undefined) values["meta"] = d.meta;

  const [row] = await db
    .insert(grapeIntakes)
    .values(values as typeof grapeIntakes.$inferInsert)
    .returning();
  if (!row) return c.json({ error: "insert_failed" }, 500);

  await audit(c, "cellar.grape_intake.create", "grape_intake", row.id, {
    flagsCount: flags.length,
  });
  return c.json({ ...row, flags }, 201);
});
