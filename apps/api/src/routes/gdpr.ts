import { Hono } from "hono";
import { z } from "zod";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { and, eq } from "drizzle-orm";
import {
  gdprExportJobs,
  organizations,
  type DbTx,
} from "@wined/db";
import { getAuth } from "@wined/auth";
import { audit } from "../lib/audit.js";
import { env } from "../env.js";

export const gdprRoute = new Hono();

let queue: Queue | null = null;
function getQueue(): Queue {
  if (!queue) {
    queue = new Queue("gdpr.export", {
      connection: new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null }),
    });
  }
  return queue;
}

const ExportSchema = z.object({
  scope: z.enum(["user", "workspace", "organization"]).default("user"),
});

// POST /v1/me/export — enqueue an export job for the caller.
gdprRoute.post("/me/export", async (c) => {
  const auth = getAuth(c);
  const body = (await c.req.json().catch(() => ({}))) as unknown;
  const parsed = ExportSchema.safeParse(body);
  const scope = parsed.success ? parsed.data.scope : "user";

  if (scope === "organization" && auth.role !== "admin") {
    return c.json({ error: "forbidden_role" }, 403);
  }

  const db = c.get("db") as DbTx;
  const inserted = await db
    .insert(gdprExportJobs)
    .values({
      organizationId: auth.orgId,
      requestedBy: auth.userId,
      scope,
      status: "queued",
    })
    .returning();
  const job = inserted[0];
  if (!job) {
    return c.json({ error: "insert_failed" }, 500);
  }

  await getQueue().add("export", {
    exportJobId: job.id,
    orgId: auth.orgId,
    userId: auth.userId,
    scope,
  });
  await audit(c, "gdpr.export.requested", "gdpr_export_job", job.id, {
    scope,
  });
  return c.json({ jobId: job.id, status: "queued" });
});

// GET /v1/me/export/:id — query an export job by id (only the requester can read it).
gdprRoute.get("/me/export/:id", async (c) => {
  const auth = getAuth(c);
  const id = c.req.param("id");
  const db = c.get("db") as DbTx;
  const rows = await db
    .select()
    .from(gdprExportJobs)
    .where(
      and(
        eq(gdprExportJobs.id, id),
        eq(gdprExportJobs.requestedBy, auth.userId),
      ),
    );
  const row = rows[0];
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json(row);
});

// DELETE /v1/orgs/:id — soft-delete the org with 30d retention before hard delete.
gdprRoute.delete("/orgs/:id", async (c) => {
  const auth = getAuth(c);
  const id = c.req.param("id");
  if (id !== auth.orgId) return c.json({ error: "forbidden" }, 403);
  if (auth.role !== "admin") return c.json({ error: "forbidden_role" }, 403);

  const db = c.get("db") as DbTx;
  const now = new Date();
  const hardDeleteAt = new Date(now.getTime() + 30 * 86400 * 1000);

  await db
    .update(organizations)
    .set({
      status: "pending_delete",
      deleteRequestedAt: now,
      hardDeleteAt,
    })
    .where(eq(organizations.id, id));

  await audit(c, "gdpr.org.soft_delete", "organization", id, {
    hardDeleteAt: hardDeleteAt.toISOString(),
  });
  return c.json({ ok: true, hardDeleteAt });
});

// POST /v1/orgs/:id/cancel-delete — cancel a pending delete.
gdprRoute.post("/orgs/:id/cancel-delete", async (c) => {
  const auth = getAuth(c);
  const id = c.req.param("id");
  if (id !== auth.orgId) return c.json({ error: "forbidden" }, 403);
  if (auth.role !== "admin") return c.json({ error: "forbidden_role" }, 403);

  const db = c.get("db") as DbTx;
  await db
    .update(organizations)
    .set({ status: "active", deleteRequestedAt: null, hardDeleteAt: null })
    .where(eq(organizations.id, id));
  await audit(c, "gdpr.org.cancel_delete", "organization", id);
  return c.json({ ok: true });
});
