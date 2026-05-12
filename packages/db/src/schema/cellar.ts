import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  agentInvocations,
  documents,
  organizations,
  users,
} from "./core.js";
import { denominationsOfOrigin } from "./curators.js";

// ===== VINEYARDS =====
export const vineyards = pgTable(
  "vineyards",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    doId: uuid("do_id").references(() => denominationsOfOrigin.id),
    plotCode: text("plot_code"),
    areaHa: numeric("area_ha", { precision: 8, scale: 4 }),
    altitudeM: integer("altitude_m"),
    soilType: text("soil_type"),
    varieties: text("varieties").array(),
    meta: jsonb("meta").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    idxOrg: index("idx_vy_org").on(t.organizationId),
  }),
);

// ===== DEPOSITS =====
export const deposits = pgTable(
  "deposits",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    capacityL: numeric("capacity_l", { precision: 10, scale: 2 }),
    material: text("material"),
    status: text("status").notNull().default("empty"),
    meta: jsonb("meta").notNull().default(sql`'{}'::jsonb`),
  },
  (t) => ({
    orgCodeUnique: uniqueIndex("deposits_organization_id_code_key").on(
      t.organizationId,
      t.code,
    ),
  }),
);

// ===== VINTAGES =====
export const vintages = pgTable(
  "vintages",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    summary: text("summary"),
    weatherNotes: text("weather_notes"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    meta: jsonb("meta").notNull().default(sql`'{}'::jsonb`),
  },
  (t) => ({
    orgYearUnique: uniqueIndex("vintages_organization_id_year_key").on(
      t.organizationId,
      t.year,
    ),
  }),
);

// ===== WINE LOTS =====
export const wineLots = pgTable(
  "wine_lots",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    vintageId: uuid("vintage_id").references(() => vintages.id),
    vineyardId: uuid("vineyard_id").references(() => vineyards.id),
    depositId: uuid("deposit_id").references(() => deposits.id),
    doId: uuid("do_id").references(() => denominationsOfOrigin.id),
    varietyBlend: jsonb("variety_blend"),
    volumeL: numeric("volume_l", { precision: 10, scale: 2 }),
    status: text("status").notNull().default("fermenting"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    bottledAt: timestamp("bottled_at", { withTimezone: true }),
    meta: jsonb("meta").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    orgCodeUnique: uniqueIndex("wine_lots_organization_id_code_key").on(
      t.organizationId,
      t.code,
    ),
    idxOrgStatus: index("idx_lots_org_status").on(t.organizationId, t.status),
  }),
);

// ===== LOT OPERATIONS =====
export const lotOperations = pgTable(
  "lot_operations",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    lotId: uuid("lot_id")
      .notNull()
      .references(() => wineLots.id, { onDelete: "cascade" }),
    opType: text("op_type").notNull(),
    performedAt: timestamp("performed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    performedBy: uuid("performed_by").references(() => users.id),
    inputs: jsonb("inputs").notNull(),
    notes: text("notes"),
    citationIds: uuid("citation_ids").array(),
    agentInvocationId: uuid("agent_invocation_id").references(
      () => agentInvocations.id,
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    idxLotTime: index("idx_ops_lot_time").on(t.lotId, t.performedAt),
  }),
);

// ===== LAB ANALYSES =====
export const labAnalyses = pgTable(
  "lab_analyses",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    lotId: uuid("lot_id").references(() => wineLots.id, {
      onDelete: "cascade",
    }),
    documentId: uuid("document_id").references(() => documents.id),
    sampledAt: timestamp("sampled_at", { withTimezone: true }),
    alcoholPct: numeric("alcohol_pct", { precision: 4, scale: 2 }),
    ph: numeric("ph", { precision: 4, scale: 2 }),
    totalAcidityGL: numeric("total_acidity_g_l", { precision: 5, scale: 2 }),
    volatileAcidityGL: numeric("volatile_acidity_g_l", {
      precision: 5,
      scale: 2,
    }),
    so2FreeMgL: numeric("so2_free_mg_l", { precision: 6, scale: 2 }),
    so2TotalMgL: numeric("so2_total_mg_l", { precision: 6, scale: 2 }),
    residualSugarGL: numeric("residual_sugar_g_l", {
      precision: 6,
      scale: 2,
    }),
    malicAcidGL: numeric("malic_acid_g_l", { precision: 5, scale: 2 }),
    lacticAcidGL: numeric("lactic_acid_g_l", { precision: 5, scale: 2 }),
    density: numeric("density", { precision: 6, scale: 4 }),
    outOfRangeFlags: jsonb("out_of_range_flags")
      .notNull()
      .default(sql`'[]'::jsonb`),
    raw: jsonb("raw").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    idxLotTime: index("idx_lab_lot_time").on(t.lotId, t.sampledAt),
  }),
);

// ===== GRAPE INTAKES =====
export const grapeIntakes = pgTable(
  "grape_intakes",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    vintageId: uuid("vintage_id").references(() => vintages.id),
    vineyardId: uuid("vineyard_id").references(() => vineyards.id),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    variety: text("variety").notNull(),
    weightKg: numeric("weight_kg", { precision: 10, scale: 2 }).notNull(),
    baume: numeric("baume", { precision: 4, scale: 2 }),
    ph: numeric("ph", { precision: 4, scale: 2 }),
    sanityScore: integer("sanity_score"),
    outOfHistoricalFlags: jsonb("out_of_historical_flags")
      .notNull()
      .default(sql`'[]'::jsonb`),
    meta: jsonb("meta").notNull().default(sql`'{}'::jsonb`),
  },
  (t) => ({
    idxOrgVintage: index("idx_intakes_org_vintage").on(
      t.organizationId,
      t.vintageId,
    ),
  }),
);

// ===== SCHEDULED OPERATIONS =====
export const scheduledOperations = pgTable(
  "scheduled_operations",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    lotId: uuid("lot_id").references(() => wineLots.id, {
      onDelete: "cascade",
    }),
    opType: text("op_type").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    doneOpId: uuid("done_op_id").references(() => lotOperations.id),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    idxOrgDue: index("idx_sched_org_due").on(t.organizationId, t.dueAt),
  }),
);
