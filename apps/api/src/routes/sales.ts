import { Hono } from "hono";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { salesReports, type DbTx } from "@wined/db";
import { getAuth } from "@wined/auth";

export const salesRoute = new Hono();

// GET /v1/sales/rotation — analyse rotation: which wines sold a lot vs few in window
salesRoute.get("/rotation", async (c) => {
  const auth = getAuth(c);
  const db = c.get("db") as DbTx;
  const from =
    c.req.query("from") ??
    new Date(Date.now() - 90 * 86400 * 1000).toISOString().slice(0, 10);
  const to = c.req.query("to") ?? new Date().toISOString().slice(0, 10);

  const result = await db.execute(sql`
    SELECT
      reference_label,
      wine_list_item_id,
      SUM(CAST(quantity AS numeric)) AS total_units,
      SUM(CAST(revenue_eur AS numeric)) AS total_revenue,
      COUNT(*) AS sales_count
    FROM sales_records
    WHERE organization_id = ${auth.orgId}::uuid
      AND sold_at BETWEEN ${from}::date AND ${to}::date
    GROUP BY reference_label, wine_list_item_id
    ORDER BY total_units DESC NULLS LAST
    LIMIT 100
  `);

  const rows =
    (result as { rows?: unknown[] }).rows ?? (result as unknown as unknown[]);
  return c.json({ period: { from, to }, rotation: rows });
});

const IngestSchema = z.object({
  documentId: z.string().uuid(),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
});

salesRoute.post("/reports/ingest", async (c) => {
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
  const [row] = await db
    .insert(salesReports)
    .values({
      organizationId: auth.orgId,
      sourceDocId: parsed.data.documentId,
      periodStart: parsed.data.periodStart ?? null,
      periodEnd: parsed.data.periodEnd ?? null,
    })
    .returning();

  // TODO: enqueue extraction job to parse rows and insert sales_records

  return c.json({ reportId: row?.id, status: "created" });
});
