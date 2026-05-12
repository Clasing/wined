import { sql } from "drizzle-orm";
import type { DbClient, DbTx } from "./index.js";

/**
 * Runs `fn` inside a transaction that has the per-tenant GUC
 * `app.current_org` set, as required by the RLS policies in §3.8.
 *
 * The third arg `true` to `set_config` scopes the setting to the
 * transaction only (equivalent to SET LOCAL).
 */
export async function withTenant<T>(
  db: DbClient,
  orgId: string,
  fn: (tx: DbTx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.current_org', ${orgId}, true)`);
    return fn(tx);
  });
}
