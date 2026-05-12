import { and, eq, lte } from "drizzle-orm";
import { createDb, organizations } from "@wined/db";
import { env } from "../env.js";

/**
 * Hard-delete orgs whose 30-day soft-delete window has elapsed.
 * Cascades via FK constraints on every child table referencing organizations.
 */
export async function runHardDeleteCron(): Promise<{
  processed: number;
  deleted: number;
}> {
  const db = createDb(env.DATABASE_URL);
  const now = new Date();

  const due = await db
    .select()
    .from(organizations)
    .where(
      and(
        eq(organizations.status, "pending_delete"),
        lte(organizations.hardDeleteAt, now),
      ),
    );

  let deleted = 0;
  for (const org of due) {
    try {
      await db.delete(organizations).where(eq(organizations.id, org.id));
      deleted++;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        "[gdpr-hard-delete-cron] failed",
        org.id,
        (err as Error).message,
      );
    }
  }

  return { processed: due.length, deleted };
}

// Allow direct execution: `node dist/workers/gdpr-hard-delete-cron.js`.
if (import.meta.url === `file://${process.argv[1]}`) {
  runHardDeleteCron()
    .then((r) => {
      // eslint-disable-next-line no-console
      console.log("[gdpr-hard-delete-cron]", r);
      process.exit(0);
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[gdpr-hard-delete-cron] fatal", err);
      process.exit(1);
    });
}
