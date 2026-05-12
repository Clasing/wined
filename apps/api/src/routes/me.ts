import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { userMemory, type DbTx } from "@wined/db";
import { getAuth } from "@wined/auth";
import { audit } from "../lib/audit.js";

export const meRoute = new Hono();

const CreateMemorySchema = z.object({
  kind: z.string().min(1).max(64),
  content: z.string().min(1),
  sourceMessageId: z.string().uuid().optional(),
});

const UpdateMemorySchema = z
  .object({
    kind: z.string().min(1).max(64).optional(),
    content: z.string().min(1).optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (v) => v.kind !== undefined || v.content !== undefined || v.isActive !== undefined,
    { message: "at_least_one_field_required" },
  );

// GET /v1/me/memory — list memories for current user in current org
meRoute.get("/", async (c) => {
  const auth = getAuth(c);
  const db = c.get("db") as DbTx;
  const rows = await db
    .select()
    .from(userMemory)
    .where(
      and(
        eq(userMemory.userId, auth.userId),
        eq(userMemory.organizationId, auth.orgId),
      ) as SQL,
    )
    .orderBy(desc(userMemory.createdAt))
    .limit(500);
  return c.json({ rows });
});

// GET /v1/me/memory/:id
meRoute.get("/:id", async (c) => {
  const auth = getAuth(c);
  const db = c.get("db") as DbTx;
  const id = c.req.param("id");
  const [row] = await db
    .select()
    .from(userMemory)
    .where(
      and(
        eq(userMemory.id, id),
        eq(userMemory.userId, auth.userId),
        eq(userMemory.organizationId, auth.orgId),
      ) as SQL,
    )
    .limit(1);
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json(row);
});

// POST /v1/me/memory
meRoute.post("/", async (c) => {
  const auth = getAuth(c);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = CreateMemorySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  }

  const db = c.get("db") as DbTx;
  const [row] = await db
    .insert(userMemory)
    .values({
      userId: auth.userId,
      organizationId: auth.orgId,
      kind: parsed.data.kind,
      content: parsed.data.content,
      sourceMessageId: parsed.data.sourceMessageId ?? null,
      isActive: true,
    })
    .returning();

  if (!row) return c.json({ error: "insert_failed" }, 500);

  await audit(c, "user_memory.create", "user_memory", row.id, {
    kind: parsed.data.kind,
  });
  return c.json(row, 201);
});

// PUT /v1/me/memory/:id
meRoute.put("/:id", async (c) => {
  const auth = getAuth(c);
  const id = c.req.param("id");
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = UpdateMemorySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  }

  const db = c.get("db") as DbTx;
  const patch: {
    kind?: string;
    content?: string;
    isActive?: boolean;
    updatedAt: Date;
  } = { updatedAt: new Date() };
  if (parsed.data.kind !== undefined) patch.kind = parsed.data.kind;
  if (parsed.data.content !== undefined) patch.content = parsed.data.content;
  if (parsed.data.isActive !== undefined) patch.isActive = parsed.data.isActive;
  const [row] = await db
    .update(userMemory)
    .set(patch)
    .where(
      and(
        eq(userMemory.id, id),
        eq(userMemory.userId, auth.userId),
        eq(userMemory.organizationId, auth.orgId),
      ) as SQL,
    )
    .returning();
  if (!row) return c.json({ error: "not_found" }, 404);

  await audit(c, "user_memory.update", "user_memory", id, parsed.data);
  return c.json(row);
});

// DELETE /v1/me/memory/:id
meRoute.delete("/:id", async (c) => {
  const auth = getAuth(c);
  const id = c.req.param("id");
  const db = c.get("db") as DbTx;
  const deleted = await db
    .delete(userMemory)
    .where(
      and(
        eq(userMemory.id, id),
        eq(userMemory.userId, auth.userId),
        eq(userMemory.organizationId, auth.orgId),
      ) as SQL,
    )
    .returning();
  if (deleted.length === 0) return c.json({ error: "not_found" }, 404);
  await audit(c, "user_memory.delete", "user_memory", id);
  return c.body(null, 204);
});

// DELETE /v1/me/memory — purge all
meRoute.delete("/", async (c) => {
  const auth = getAuth(c);
  const db = c.get("db") as DbTx;
  await db
    .delete(userMemory)
    .where(
      and(
        eq(userMemory.userId, auth.userId),
        eq(userMemory.organizationId, auth.orgId),
      ) as SQL,
    );
  await audit(c, "user_memory.purge_all", "user", auth.userId);
  return c.body(null, 204);
});
