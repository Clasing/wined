import { createDb, scheduledOperations } from "@wined/db";
import { and, gte, isNull, lte } from "drizzle-orm";
import { env } from "../env.js";

export type ScheduledOpsReminderResult = {
  scanned: number;
  reminded: number;
};

/**
 * Cron worker that scans pending scheduled cellar operations whose
 * `due_at` falls within the next 24 hours and emits reminder log lines.
 *
 * Schema note: `scheduled_operations` has no `reminded_at` / `status`
 * columns, so we approximate "pending" as `done_op_id IS NULL`. The
 * cron runs hourly; duplicate log lines for the same op across runs
 * are accepted (idempotent at log-sink level).
 */
export async function runScheduledOpsReminderCron(): Promise<ScheduledOpsReminderResult> {
  const db = createDb(env.DATABASE_URL);
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const rows = await db
    .select()
    .from(scheduledOperations)
    .where(
      and(
        isNull(scheduledOperations.doneOpId),
        gte(scheduledOperations.dueAt, now),
        lte(scheduledOperations.dueAt, tomorrow),
      ),
    )
    .limit(500);

  let reminded = 0;
  for (const op of rows) {
    console.log(
      `[scheduled-ops-reminder] org=${op.organizationId} op=${op.id} type=${op.opType} due=${op.dueAt.toISOString()} lot=${op.lotId ?? "-"}`,
    );
    reminded++;
  }
  return { scanned: rows.length, reminded };
}

if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("scheduled-ops-reminder-cron.js")
) {
  runScheduledOpsReminderCron()
    .then((result) => {
      console.log(JSON.stringify(result));
      process.exit(0);
    })
    .catch((err) => {
      console.error("[scheduled-ops-reminder] failed", err);
      process.exit(1);
    });
}
