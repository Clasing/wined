import { Hono } from "hono";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { agentInvocations, type DbTx } from "@wined/db";
import { getAuth } from "@wined/auth";

export const agentInvocationsRoute = new Hono();

// GET /v1/agent-invocations/recent?limit=N
agentInvocationsRoute.get("/recent", async (c) => {
  const auth = getAuth(c);
  const db = c.get("db") as DbTx;
  const limitParam = Number(c.req.query("limit") ?? 50);
  const limit = Math.min(Number.isFinite(limitParam) ? limitParam : 50, 200);
  const rows = await db
    .select()
    .from(agentInvocations)
    .where(eq(agentInvocations.organizationId, auth.orgId) as SQL)
    .orderBy(desc(agentInvocations.createdAt))
    .limit(limit);
  return c.json({ rows });
});

// GET /v1/agent-invocations/:id
agentInvocationsRoute.get("/:id", async (c) => {
  const auth = getAuth(c);
  const id = c.req.param("id");
  const db = c.get("db") as DbTx;
  const [row] = await db
    .select()
    .from(agentInvocations)
    .where(
      and(
        eq(agentInvocations.id, id),
        eq(agentInvocations.organizationId, auth.orgId),
      ) as SQL,
    )
    .limit(1);
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json(row);
});
