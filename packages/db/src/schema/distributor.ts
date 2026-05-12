import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import {
  documents,
  organizations,
  users,
  wineCatalogGlobal,
} from "./core.js";

// ===== DISTRIBUTOR CATALOGS =====
export const distributorCatalogs = pgTable("distributor_catalogs", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuid_generate_v4()`),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sourceDocId: uuid("source_doc_id").references(() => documents.id),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ===== DISTRIBUTOR CATALOG ITEMS =====
export const distributorCatalogItems = pgTable(
  "distributor_catalog_items",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    catalogId: uuid("catalog_id")
      .notNull()
      .references(() => distributorCatalogs.id, { onDelete: "cascade" }),
    sku: text("sku"),
    globalWineId: uuid("global_wine_id").references(() => wineCatalogGlobal.id),
    displayName: text("display_name").notNull(),
    producer: text("producer"),
    vintage: integer("vintage"),
    doAppellation: text("do_appellation"),
    wineType: text("wine_type"),
    costEur: numeric("cost_eur", { precision: 8, scale: 2 }),
    pvpEur: numeric("pvp_eur", { precision: 8, scale: 2 }),
    stock: integer("stock").notNull().default(0),
    technicalSheetDocId: uuid("technical_sheet_doc_id").references(
      () => documents.id,
    ),
    meta: jsonb("meta").notNull().default(sql`'{}'::jsonb`),
  },
  (t) => ({
    idxCat: index("idx_dci_cat").on(t.catalogId),
  }),
);

// ===== HORECA CLIENTS =====
export const horecaClients = pgTable("horeca_clients", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuid_generate_v4()`),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  segment: text("segment"),
  city: text("city"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ===== COMMERCIAL SHEETS =====
export const commercialSheets = pgTable(
  "commercial_sheets",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    catalogItemId: uuid("catalog_item_id").references(
      () => distributorCatalogItems.id,
    ),
    horecaClientId: uuid("horeca_client_id").references(() => horecaClients.id),
    generatedBy: uuid("generated_by").references(() => users.id),
    content: jsonb("content").notNull(),
    pdfStorageUrl: text("pdf_storage_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    idxOrg: index("idx_csheets_org").on(t.organizationId, t.createdAt),
  }),
);
