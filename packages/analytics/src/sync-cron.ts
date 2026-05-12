import { createDb, analyticsEvents } from "@wined/db";
import { eq } from "drizzle-orm";
import { PostHog } from "posthog-node";

/**
 * Retro-syncs analytics events that failed (or skipped) the best-effort
 * PostHog capture in `track()`. Intended for a 15-minute cron.
 *
 * Returns a summary so the cron job log shows progress.
 */
export async function runPosthogSyncCron(): Promise<{
  synced: number;
  failed: number;
}> {
  const key = process.env["POSTHOG_API_KEY"];
  const dbUrl = process.env["DATABASE_URL"];
  if (!key || !dbUrl) return { synced: 0, failed: 0 };

  const ph = new PostHog(key, {
    host: process.env["POSTHOG_HOST"] ?? "https://eu.posthog.com",
  });
  const db = createDb(dbUrl);

  const rows = await db
    .select()
    .from(analyticsEvents)
    .where(eq(analyticsEvents.posthogSynced, false))
    .limit(5000);

  let synced = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const baseProps =
        row.props && typeof row.props === "object"
          ? (row.props as Record<string, unknown>)
          : {};
      ph.capture({
        distinctId: row.userId ?? `org:${row.organizationId ?? "unknown"}`,
        event: row.event,
        properties: {
          organization_id: row.organizationId,
          ...baseProps,
        },
        timestamp: row.createdAt ?? undefined,
      });
      await db
        .update(analyticsEvents)
        .set({ posthogSynced: true })
        .where(eq(analyticsEvents.id, row.id));
      synced++;
    } catch {
      failed++;
    }
  }

  await ph.shutdown();
  return { synced, failed };
}
