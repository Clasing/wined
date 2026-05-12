import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  index,
} from 'drizzle-orm/pg-core';
import { inet, vector } from './_shared.js';

// ===== ENUMS =====
export const orgProductEnum = pgEnum('org_product', ['sommelier', 'cellar', 'distributor', 'both']);

export const membershipRoleEnum = pgEnum('membership_role', [
  'owner',
  'admin',
  'member',
  'viewer',
  'external',
]);

export const docTypeEnum = pgEnum('doc_type', [
  'tasting_note',
  'wine_list',
  'invoice',
  'technical_sheet',
  'vinification_log',
  'compliance_doc',
  'lab_report',
  'contract',
  'book',
  'regulation',
  'do_pliego',
  'menu',
  'sales_report',
  'generic',
]);

export const docStatusEnum = pgEnum('doc_status', [
  'uploaded',
  'classifying',
  'parsing',
  'embedding',
  'ready',
  'failed',
  'quarantined_pii',
]);

export const agentPodEnum = pgEnum('agent_pod', [
  'router',
  'sommelier',
  'cellar',
  'distributor',
  'ingestion',
  'curator',
]);

export const sourceTierEnum = pgEnum('source_tier', [
  'regulation',
  'consensus',
  'literature',
  'tenant_private',
  'global_catalog',
]);

export const orgStatusEnum = pgEnum('org_status', ['active', 'suspended', 'pending_delete']);

export const kbPreferenceEnum = pgEnum('kb_preference', [
  'private_first',
  'global_first',
  'show_both',
]);

// ===== ORGANIZATIONS =====
export const organizations = pgTable('organizations', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuid_generate_v4()`),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  product: orgProductEnum('product').notNull().default('sommelier'),
  locale: text('locale').notNull().default('es'),
  outputLanguage: text('output_language').notNull().default('es'),
  kbPreference: kbPreferenceEnum('kb_preference').notNull().default('private_first'),
  status: orgStatusEnum('status').notNull().default('active'),
  deleteRequestedAt: timestamp('delete_requested_at', { withTimezone: true }),
  hardDeleteAt: timestamp('hard_delete_at', { withTimezone: true }),
  stripeCustomerId: text('stripe_customer_id'),
  plan: text('plan').notNull().default('pilot'),
  onboardingState: jsonb('onboarding_state')
    .notNull()
    .default(sql`'{}'::jsonb`),
  onboardingStartedAt: timestamp('onboarding_started_at', {
    withTimezone: true,
  }),
  onboardingCompletedAt: timestamp('onboarding_completed_at', {
    withTimezone: true,
  }),
  lastReminderAt: timestamp('last_reminder_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ===== USERS =====
export const users = pgTable('users', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuid_generate_v4()`),
  email: text('email').notNull(),
  passwordHash: text('password_hash'),
  fullName: text('full_name'),
  preferredLanguage: text('preferred_language').default('es'),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ===== REFRESH TOKENS =====
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    familyId: uuid('family_id').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    userAgent: text('user_agent'),
    ip: inet('ip'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxTokenHash: index('idx_refresh_tokens_token_hash').on(t.tokenHash),
    idxUser: index('idx_refresh_tokens_user').on(t.userId, t.revokedAt),
  }),
);

// ===== MEMBERSHIPS =====
export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: membershipRoleEnum('role').notNull().default('member'),
    workspaceScope: uuid('workspace_scope').array(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgUserUnique: uniqueIndex('memberships_organization_id_user_id_key').on(
      t.organizationId,
      t.userId,
    ),
    idxOrg: index('idx_mem_org').on(t.organizationId),
    idxUser: index('idx_mem_user').on(t.userId),
  }),
);

// ===== WORKSPACES =====
export const workspaces = pgTable(
  'workspaces',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: text('kind').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxOrg: index('idx_ws_org').on(t.organizationId),
  }),
);

// ===== DOCUMENTS =====
export const documents = pgTable(
  'documents',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id').references(() => workspaces.id, {
      onDelete: 'set null',
    }),
    uploadedBy: uuid('uploaded_by').references(() => users.id),
    filename: text('filename').notNull(),
    storageUrl: text('storage_url').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    contentHash: text('content_hash').notNull(),
    docType: docTypeEnum('doc_type').notNull().default('generic'),
    status: docStatusEnum('status').notNull().default('uploaded'),
    version: integer('version').notNull().default(1),
    parentDocId: uuid('parent_doc_id'),
    isActiveVersion: boolean('is_active_version').notNull().default(true),
    language: text('language'),
    ocrConfidence: numeric('ocr_confidence', { precision: 4, scale: 3 }),
    piiDetected: boolean('pii_detected').notNull().default(false),
    piiConsentUserId: uuid('pii_consent_user_id').references(() => users.id),
    piiConsentAt: timestamp('pii_consent_at', { withTimezone: true }),
    sourceTier: sourceTierEnum('source_tier').notNull().default('tenant_private'),
    meta: jsonb('meta')
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgHashUnique: uniqueIndex('documents_organization_id_content_hash_key').on(
      t.organizationId,
      t.contentHash,
    ),
    idxOrgStatus: index('idx_doc_org_status').on(t.organizationId, t.status),
    idxOrgTypeActive: index('idx_doc_org_type_active').on(
      t.organizationId,
      t.docType,
      t.isActiveVersion,
    ),
  }),
);

// ===== DOCUMENT CHUNKS (HASH-partitioned table; drizzle treats as one table) =====
export const documentChunks = pgTable('document_chunks', {
  id: uuid('id')
    .notNull()
    .default(sql`uuid_generate_v4()`),
  organizationId: uuid('organization_id').notNull(),
  documentId: uuid('document_id').notNull(),
  chunkIndex: integer('chunk_index').notNull(),
  content: text('content').notNull(),
  embedding: vector('embedding', 1024).notNull(),
  tokenCount: integer('token_count').notNull(),
  sourceTier: sourceTierEnum('source_tier').notNull().default('tenant_private'),
  language: text('language'),
  pageNumber: integer('page_number'),
  sectionPath: text('section_path'),
  meta: jsonb('meta')
    .notNull()
    .default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ===== WINE CATALOG GLOBAL =====
export const wineCatalogGlobal = pgTable('wine_catalog_global', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuid_generate_v4()`),
  externalId: text('external_id'),
  source: text('source'),
  name: text('name').notNull(),
  producer: text('producer'),
  country: text('country'),
  region: text('region'),
  doAppellation: text('do_appellation'),
  vintage: integer('vintage'),
  grapeVarieties: text('grape_varieties').array(),
  wineType: text('wine_type'),
  styleNotes: text('style_notes'),
  embedding: vector('embedding', 1024),
  meta: jsonb('meta')
    .notNull()
    .default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ===== CONVERSATIONS =====
export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id),
    workspaceId: uuid('workspace_id').references(() => workspaces.id),
    title: text('title'),
    pod: agentPodEnum('pod').notNull(),
    serviceMode: boolean('service_mode').notNull().default(false),
    disclaimerShown: boolean('disclaimer_shown').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxOrgUser: index('idx_conv_org_user').on(t.organizationId, t.userId),
  }),
);

// ===== MESSAGES =====
export const messages = pgTable(
  'messages',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id').notNull(),
    role: text('role').notNull(),
    content: jsonb('content').notNull(),
    agentName: text('agent_name'),
    citations: jsonb('citations'),
    citationCount: integer('citation_count').notNull().default(0),
    isTechnical: boolean('is_technical').notNull().default(false),
    abstained: boolean('abstained').notNull().default(false),
    tokensIn: integer('tokens_in'),
    tokensOut: integer('tokens_out'),
    latencyMs: integer('latency_ms'),
    outputLanguage: text('output_language'),
    obsoleteReason: text('obsolete_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxConv: index('idx_msg_conv').on(t.conversationId, t.createdAt),
  }),
);

// ===== AGENT INVOCATIONS =====
export const agentInvocations = pgTable(
  'agent_invocations',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    organizationId: uuid('organization_id').notNull(),
    conversationId: uuid('conversation_id').references(() => conversations.id, {
      onDelete: 'set null',
    }),
    messageId: uuid('message_id').references(() => messages.id, {
      onDelete: 'set null',
    }),
    agentName: text('agent_name').notNull(),
    toolName: text('tool_name'),
    input: jsonb('input'),
    output: jsonb('output'),
    status: text('status').notNull(),
    latencyMs: integer('latency_ms'),
    retrievedChunks: jsonb('retrieved_chunks'),
    langfuseTraceId: text('langfuse_trace_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxOrgAgent: index('idx_ai_org_agent').on(t.organizationId, t.agentName, t.createdAt),
  }),
);

// ===== EVALS RESULTS =====
export const evalsResults = pgTable('evals_results', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuid_generate_v4()`),
  organizationId: uuid('organization_id'),
  datasetId: text('dataset_id').notNull(),
  datasetVersion: text('dataset_version').notNull(),
  agentName: text('agent_name').notNull(),
  promptVersion: text('prompt_version').notNull(),
  score: numeric('score', { precision: 5, scale: 2 }).notNull(),
  perExample: jsonb('per_example').notNull(),
  runId: text('run_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ===== AUDIT LOG =====
export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    organizationId: uuid('organization_id'),
    userId: uuid('user_id'),
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: text('entity_id'),
    diff: jsonb('diff'),
    ip: inet('ip'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxOrgCreated: index('idx_audit_org_created').on(t.organizationId, t.createdAt),
  }),
);
