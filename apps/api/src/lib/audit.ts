import type { Context } from "hono";
import { auditLog, type DbTx } from "@wined/db";
import { getAuth } from "@wined/auth";

/**
 * Insert an audit_log row for the current tenant/user.
 *
 * Uses the tenant-scoped tx attached by `tenantGuard` so RLS sees the
 * correct organization. `ip` / `userAgent` are best-effort from the
 * incoming request headers.
 */
export async function audit(
  c: Context,
  action: string,
  entity: string,
  entityId: string,
  diff?: Record<string, unknown>,
): Promise<void> {
  const auth = getAuth(c);
  const db = c.get("db") as DbTx;

  const ip = c.req.header("x-forwarded-for") ?? null;
  const userAgent = c.req.header("user-agent") ?? null;

  await db.insert(auditLog).values({
    organizationId: auth.orgId,
    userId: auth.userId,
    action,
    entity,
    entityId,
    diff: diff ?? {},
    ip,
    userAgent,
  });
}
