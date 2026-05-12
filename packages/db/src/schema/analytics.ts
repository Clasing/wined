import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// ===== ANALYTICS EVENTS =====
export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    organizationId: uuid("organization_id"),
    userId: uuid("user_id"),
    event: text("event").notNull(),
    props: jsonb("props").notNull().default(sql`'{}'::jsonb`),
    posthogSynced: boolean("posthog_synced").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    idxEventTime: index("idx_ae_event_time").on(t.event, t.createdAt),
    idxOrgTime: index("idx_ae_org_time").on(t.organizationId, t.createdAt),
  }),
);
