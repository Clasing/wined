import { Hono } from "hono";
import { z } from "zod";
import { sql, eq, desc } from "drizzle-orm";
import { workspaces, type DbTx } from "@wined/db";
import { getAuth } from "@wined/auth";
import { audit } from "../lib/audit.js";

export const workspacesRoute = new Hono();

const CreateSchema = z.object({
  name: z.string().min(1),
  kind: z.string().optional(),
});

// POST /v1/workspaces — admin-only create workspace for current org.
workspacesRoute.post("/", async (c) => {
  const auth = getAuth(c);
  if (auth.role !== "admin")
    return c.json({ error: "forbidden" }, 403);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success)
    return c.json(
      { error: "invalid_body", issues: parsed.error.issues },
      400,
    );

  const db = c.get("db") as DbTx;
  const [row] = await db
    .insert(workspaces)
    .values({
      organizationId: auth.orgId,
      name: parsed.data.name,
      kind: parsed.data.kind ?? "restaurant",
    })
    .returning();

  if (!row) return c.json({ error: "insert_failed" }, 500);

  await audit(c, "workspace.create", "workspace", row.id, {
    name: parsed.data.name,
    kind: row.kind,
  });
  return c.json(row, 201);
});

// GET /v1/workspaces — list workspaces for current org.
workspacesRoute.get("/", async (c) => {
  const auth = getAuth(c);
  const db = c.get("db") as DbTx;
  const rows = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.organizationId, auth.orgId))
    .orderBy(desc(workspaces.createdAt));
  return c.json({ rows });
});

// GET /v1/workspaces/cross-report — aggregate counts per workspace.
workspacesRoute.get("/cross-report", async (c) => {
  const auth = getAuth(c);
  const db = c.get("db") as DbTx;
  const result = await db.execute(sql`
    SELECT
      w.id,
      w.name,
      w.kind,
      COALESCE(wl.list_count, 0)::int AS active_wine_lists,
      COALESCE(wli.item_count, 0)::int AS total_wine_items
    FROM workspaces w
    LEFT JOIN (
      SELECT workspace_id, COUNT(*)::int AS list_count
      FROM wine_lists
      WHERE organization_id = ${auth.orgId}::uuid AND is_active = true
      GROUP BY workspace_id
    ) wl ON wl.workspace_id = w.id
    LEFT JOIN (
      SELECT wl.workspace_id, COUNT(*)::int AS item_count
      FROM wine_list_items wli
      JOIN wine_lists wl ON wl.id = wli.list_id
      WHERE wl.organization_id = ${auth.orgId}::uuid AND wl.is_active = true
      GROUP BY wl.workspace_id
    ) wli ON wli.workspace_id = w.id
    WHERE w.organization_id = ${auth.orgId}::uuid
    ORDER BY w.created_at
  `);

  const rows =
    (result as unknown as { rows?: unknown[] }).rows ??
    (result as unknown as unknown[]);
  return c.json({ rows });
});
