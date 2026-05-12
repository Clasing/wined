import type { MiddlewareHandler } from "hono";
import { withTenant, type DbTx } from "@wined/db";
import { getAuth } from "@wined/auth";
import { getDb } from "../db.js";

declare module "hono" {
  interface ContextVariableMap {
    db: DbTx;
    disclaimer_needed: boolean;
  }
}

/**
 * Wraps the downstream handler chain in a tenant-scoped transaction so
 * Postgres RLS policies see `app.current_org = $orgId`. The tx handle is
 * exposed via `c.var.db`.
 *
 * MUST run after `clerkAuth()` so `auth.orgId` is set.
 */
export const tenantGuard: MiddlewareHandler = async (c, next) => {
  const auth = getAuth(c);
  const db = getDb();
  await withTenant(db, auth.orgId, async (tx) => {
    c.set("db", tx);
    await next();
  });
};
