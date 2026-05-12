import { PostHog } from "posthog-node";
import { createDb, analyticsEvents } from "@wined/db";
import type { AnalyticsEventName } from "./events.js";

let posthog: PostHog | null = null;

function getPostHog(): PostHog | null {
  const key = process.env["POSTHOG_API_KEY"];
  if (!key) return null;
  if (!posthog) {
    posthog = new PostHog(key, {
      host: process.env["POSTHOG_HOST"] ?? "https://eu.posthog.com",
      flushAt: 20,
      flushInterval: 10_000,
    });
  }
  return posthog;
}

export type TrackOpts = {
  event: AnalyticsEventName | string;
  orgId: string;
  userId?: string;
  properties?: Record<string, unknown>;
  sessionId?: string;
};

/**
 * Track an analytics event.
 *
 * Two-stage delivery:
 *  1. Persist row in `analytics_events` (source of truth, RLS-friendly).
 *  2. Best-effort capture to PostHog (non-blocking; cron retries unsynced rows).
 *
 * Never throws — analytics must never break the calling request.
 */
export async function track(opts: TrackOpts): Promise<void> {
  const props: Record<string, unknown> = { ...(opts.properties ?? {}) };
  if (opts.sessionId !== undefined) props["session_id"] = opts.sessionId;

  // 1. Persist in DB (source of truth)
  try {
    const dbUrl = process.env["DATABASE_URL"];
    if (dbUrl) {
      const db = createDb(dbUrl);
      await db.insert(analyticsEvents).values({
        organizationId: opts.orgId,
        userId: opts.userId ?? null,
        event: opts.event,
        props,
        posthogSynced: false,
      });
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[analytics] db insert failed", err);
  }

  // 2. Send to PostHog (best-effort)
  const ph = getPostHog();
  if (ph && opts.userId) {
    try {
      ph.capture({
        distinctId: opts.userId,
        event: opts.event,
        properties: {
          organization_id: opts.orgId,
          ...props,
        },
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[analytics] posthog capture failed", err);
    }
  }
}

export async function flushAnalytics(): Promise<void> {
  if (posthog) await posthog.flush();
}

export async function shutdownAnalytics(): Promise<void> {
  if (posthog) {
    await posthog.shutdown();
    posthog = null;
  }
}
