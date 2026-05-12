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
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  documents,
  organizations,
  users,
  wineCatalogGlobal,
  workspaces,
} from "./core.js";

// ===== WINE LISTS =====
export const wineLists = pgTable(
  "wine_lists",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id").references(() => workspaces.id),
    name: text("name").notNull(),
    version: integer("version").notNull().default(1),
    isActive: boolean("is_active").notNull().default(false),
    sourceDocId: uuid("source_doc_id").references(() => documents.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    activeUnique: uniqueIndex("idx_winelist_active")
      .on(t.organizationId, t.workspaceId)
      .where(sql`${t.isActive} = true`),
  }),
);

// ===== WINE LIST ITEMS =====
export const wineListItems = pgTable(
  "wine_list_items",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    listId: uuid("list_id")
      .notNull()
      .references(() => wineLists.id, { onDelete: "cascade" }),
    globalWineId: uuid("global_wine_id").references(() => wineCatalogGlobal.id),
    displayName: text("display_name").notNull(),
    producer: text("producer"),
    vintage: integer("vintage"),
    doAppellation: text("do_appellation"),
    wineType: text("wine_type"),
    priceEur: numeric("price_eur", { precision: 8, scale: 2 }),
    priceGlassEur: numeric("price_glass_eur", { precision: 8, scale: 2 }),
    stock: integer("stock").notNull().default(0),
    inStock: boolean("in_stock").generatedAlwaysAs(sql`stock > 0`),
    notes: text("notes"),
    meta: jsonb("meta").notNull().default(sql`'{}'::jsonb`),
  },
  (t) => ({
    idxListStock: index("idx_wli_list_stock").on(t.listId, t.inStock),
  }),
);

// ===== RESTAURANT GUESTS =====
export const restaurantGuests = pgTable(
  "restaurant_guests",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id").references(() => workspaces.id),
    displayName: text("display_name").notNull(),
    emailHash: text("email_hash"),
    piiConsent: boolean("pii_consent").notNull().default(false),
    consentAt: timestamp("consent_at", { withTimezone: true }),
    consentUserId: uuid("consent_user_id").references(() => users.id),
    preferences: jsonb("preferences").notNull().default(sql`'{}'::jsonb`),
    aversions: jsonb("aversions").notNull().default(sql`'[]'::jsonb`),
    allergies: jsonb("allergies").notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    idxOrgWs: index("idx_guests_org_ws").on(t.organizationId, t.workspaceId),
  }),
);

// ===== GUEST ORDERS =====
export const guestOrders = pgTable(
  "guest_orders",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    guestId: uuid("guest_id")
      .notNull()
      .references(() => restaurantGuests.id, { onDelete: "cascade" }),
    listItemId: uuid("list_item_id").references(() => wineListItems.id),
    orderedAt: timestamp("ordered_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    liked: boolean("liked"),
    notes: text("notes"),
  },
  (t) => ({
    idxGuestTime: index("idx_gorders_guest_time").on(t.guestId, t.orderedAt),
  }),
);

// ===== TASTING MENUS =====
export const tastingMenus = pgTable("tasting_menus", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuid_generate_v4()`),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id").references(() => workspaces.id),
  name: text("name").notNull(),
  sourceDocId: uuid("source_doc_id").references(() => documents.id),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ===== DISHES =====
export const dishes = pgTable("dishes", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuid_generate_v4()`),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  menuId: uuid("menu_id").references(() => tastingMenus.id, {
    onDelete: "cascade",
  }),
  name: text("name").notNull(),
  description: text("description"),
  courseOrder: integer("course_order"),
  descriptors: jsonb("descriptors").notNull().default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
