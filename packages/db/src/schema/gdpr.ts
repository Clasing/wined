import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { messages, organizations, users } from "./core.js";

// ===== USER MEMORY =====
export const userMemory = pgTable(
  "user_memory",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    content: text("content").notNull(),
    sourceMessageId: uuid("source_message_id").references(() => messages.id),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    idxUserOrg: index("idx_umem_user_org").on(
      t.userId,
      t.organizationId,
      t.isActive,
    ),
  }),
);

// ===== MESSAGE FEEDBACK =====
export const messageFeedback = pgTable(
  "message_feedback",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    rating: smallint("rating").notNull(),
    reason: text("reason"),
    comment: text("comment"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolutionNotes: text("resolution_notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    msgUserUnique: uniqueIndex("message_feedback_message_id_user_id_key").on(
      t.messageId,
      t.userId,
    ),
    idxOrgRating: index("idx_fb_org_rating").on(
      t.organizationId,
      t.rating,
      t.createdAt,
    ),
    ratingCheck: check("message_feedback_rating_check", sql`rating IN (1, -1)`),
  }),
);

// ===== GDPR EXPORT JOBS =====
export const gdprExportJobs = pgTable("gdpr_export_jobs", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuid_generate_v4()`),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  requestedBy: uuid("requested_by")
    .notNull()
    .references(() => users.id),
  scope: text("scope").notNull(),
  status: text("status").notNull().default("queued"),
  zipUrl: text("zip_url"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
