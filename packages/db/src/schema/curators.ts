import { sql } from "drizzle-orm";
import {
  date,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sourceTierEnum } from "./core.js";
import { vector } from "./_shared.js";

// ===== REGULATORY CORPUS =====
export const regulatoryCorpus = pgTable(
  "regulatory_corpus",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    source: text("source").notNull(),
    sourceTier: sourceTierEnum("source_tier").notNull(),
    jurisdiction: text("jurisdiction").notNull(),
    regCode: text("reg_code").notNull(),
    articleRef: text("article_ref"),
    title: text("title").notNull(),
    body: text("body").notNull(),
    effectiveDate: date("effective_date"),
    supersedesId: uuid("supersedes_id"),
    language: text("language").notNull().default("es"),
    embedding: vector("embedding", 1024),
    meta: jsonb("meta").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    idxJuriCode: index("idx_reg_juri_code").on(t.jurisdiction, t.regCode),
  }),
);

// ===== DENOMINATIONS OF ORIGIN =====
export const denominationsOfOrigin = pgTable("denominations_of_origin", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuid_generate_v4()`),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  country: text("country").notNull().default("ES"),
  kind: text("kind").notNull(),
  councilUrl: text("council_url"),
  pliegoDocId: uuid("pliego_doc_id").references(() => regulatoryCorpus.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ===== DO RULES =====
export const doRules = pgTable(
  "do_rules",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    doId: uuid("do_id")
      .notNull()
      .references(() => denominationsOfOrigin.id, { onDelete: "cascade" }),
    ruleKind: text("rule_kind").notNull(),
    payload: jsonb("payload").notNull(),
    citationId: uuid("citation_id").references(() => regulatoryCorpus.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    idxDoRulesDo: index("idx_do_rules_do").on(t.doId, t.ruleKind),
  }),
);

// ===== CORPUS CONFLICTS =====
export const corpusConflicts = pgTable("corpus_conflicts", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuid_generate_v4()`),
  detectedBy: text("detected_by").notNull(),
  sourceAId: uuid("source_a_id"),
  sourceBId: uuid("source_b_id"),
  topic: text("topic").notNull(),
  resolution: text("resolution").notNull(),
  resolutionTier: sourceTierEnum("resolution_tier").notNull(),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ===== CURATOR RUNS =====
export const curatorRuns = pgTable(
  "curator_runs",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    curatorName: text("curator_name").notNull(),
    trigger: text("trigger").notNull(),
    organizationId: uuid("organization_id"),
    status: text("status").notNull(),
    stats: jsonb("stats").notNull().default(sql`'{}'::jsonb`),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    langfuseTraceId: text("langfuse_trace_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    idxName: index("idx_cur_runs_name").on(t.curatorName, t.createdAt),
  }),
);
