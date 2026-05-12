import {
  date,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { documents, organizations } from "./core.js";
import { wineListItems } from "./sommelier.js";
import { distributorCatalogItems } from "./distributor.js";

export const salesReports = pgTable("sales_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  sourceDocId: uuid("source_doc_id").references(() => documents.id, {
    onDelete: "set null",
  }),
  periodStart: date("period_start"),
  periodEnd: date("period_end"),
  meta: jsonb("meta").default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const salesRecords = pgTable("sales_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  salesReportId: uuid("sales_report_id").references(() => salesReports.id, {
    onDelete: "cascade",
  }),
  wineListItemId: uuid("wine_list_item_id").references(() => wineListItems.id, {
    onDelete: "set null",
  }),
  distributorCatalogItemId: uuid("distributor_catalog_item_id").references(
    () => distributorCatalogItems.id,
    { onDelete: "set null" },
  ),
  referenceLabel: text("reference_label"),
  soldAt: date("sold_at"),
  quantity: numeric("quantity"),
  revenueEur: numeric("revenue_eur"),
  meta: jsonb("meta").default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
