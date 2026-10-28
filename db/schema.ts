import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  primaryKey,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
export const userAccess = sqliteTable('user_access', {
  owner:text('owner').primaryKey(),role:text('role',{enum:['user','admin','superuser']}).notNull().default('user'),
  suspended:integer('suspended').notNull().default(0),revision:text('revision').notNull(),updatedBy:text('updated_by').notNull(),updatedAt:integer('updated_at').notNull(),
});
export const userDirectory = sqliteTable('user_directory', {
  owner:text('owner').primaryKey(),email:text('email').notNull(),displayName:text('display_name').notNull(),firstSeen:integer('first_seen').notNull(),lastSeen:integer('last_seen').notNull(),
});
export const adminAudit = sqliteTable('admin_audit', {
  id:text('id').primaryKey(),actor:text('actor').notNull(),action:text('action').notNull(),target:text('target').notNull(),beforeValue:text('before_value').notNull(),afterValue:text('after_value').notNull(),reason:text('reason').notNull(),createdAt:integer('created_at').notNull(),
},t=>[index('admin_audit_created').on(t.createdAt)]);
export const operationalEvents = sqliteTable('operational_events', {
  id:text('id').primaryKey(),actor:text('actor'),event:text('event').notNull(),code:text('code'),status:integer('status'),resource:text('resource'),createdAt:integer('created_at').notNull(),
},t=>[index('operational_events_created').on(t.createdAt)]);
export const aiCredentials = sqliteTable('ai_credentials', {
  owner: text('owner').primaryKey(), provider: text('provider').notNull(), model: text('model').notNull(),
  ciphertext: text('ciphertext').notNull(), revision: text('revision').notNull(), updatedAt: integer('updated_at').notNull(),
});
export const aiOwnerLeases = sqliteTable('ai_owner_leases', {
  owner: text('owner').primaryKey(), token: text('token').notNull(), expiresAt: integer('expires_at').notNull(),
});
export const notes = sqliteTable(
  'notes',
  {
    id: text('id').primaryKey(),
    owner: text('owner').notNull(),
    title: text('title').notNull(),
    source: text('source').notNull(),
    videoId: text('video_id'),
    transcript: text('transcript').notNull().default('[]'),
    summary: text('summary'),
    status: text('status').notNull().default('ready'),
    providerJob: text('provider_job'),
    error: text('error'),
    folder: text('folder').notNull().default('Inbox'),
    starred: integer('starred').notNull().default(0),
    annotations: text('annotations').notNull().default(''),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('notes_owner_updated').on(t.owner, t.updatedAt)],
);
export const aiJobs = sqliteTable('ai_jobs', {
  id: text('id').primaryKey(), owner: text('owner').notNull(),
  noteId: text('note_id').notNull().references(() => notes.id, { onDelete: 'cascade' }),
  language: text('language').notNull(), detail: text('detail').notNull(), credentialRevision: text('credential_revision').notNull(),
  state: text('state').notNull().default('queued'), failures: integer('failures').notNull().default(0),
  nextAt: integer('next_at').notNull(), leaseUntil: integer('lease_until').notNull().default(0), leaseToken: text('lease_token'),
  runId: text('run_id'), completedParts: integer('completed_parts').notNull().default(0), totalParts: integer('total_parts').notNull().default(0),
  errorCode: text('error_code'), createdAt: integer('created_at').notNull(), updatedAt: integer('updated_at').notNull(),
}, t => [uniqueIndex('ai_jobs_active_note').on(t.noteId).where(sql`${t.state} IN ('queued','running','retry')`),index('ai_jobs_due').on(t.state,t.nextAt)]);
export const artifacts = sqliteTable(
  'artifacts',
  {
    noteId: text('note_id')
      .notNull()
      .references(() => notes.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    content: text('content').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.noteId, t.kind] })],
);
export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    noteId: text('note_id')
      .notNull()
      .references(() => notes.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    content: text('content').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('messages_note').on(t.noteId, t.createdAt)],
);
export const limits = sqliteTable(
  'limits',
  {
    owner: text('owner').notNull(),
    bucket: integer('bucket').notNull(),
    count: integer('count').notNull(),
  },
  (t) => [primaryKey({ columns: [t.owner, t.bucket] })],
);
export const accounts = sqliteTable('accounts', {
  owner: text('owner').primaryKey(),
  plan: text('plan').notNull().default('free'),
  createdAt: integer('created_at').notNull(),
});
export const billingOrders = sqliteTable(
  'billing_orders',
  {
    id: text('id').primaryKey(),
    owner: text('owner').notNull(),
    keyMode: text('key_mode').notNull(),
    providerOrderId: text('provider_order_id'),
    paymentId: text('payment_id'),
    state: text('state').notNull().default('creating'),
    amount: integer('amount').notNull(),
    currency: text('currency').notNull().default('INR'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('billing_provider_order').on(t.providerOrderId),
    uniqueIndex('billing_payment').on(t.paymentId),
    uniqueIndex('billing_active_account')
      .on(t.owner, t.keyMode)
      .where(sql`${t.state} in ('creating','created','paid')`),
    index('billing_owner_created').on(t.owner, t.createdAt),
  ],
);
export const billingEvents = sqliteTable('billing_events', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(),
  processedAt: integer('processed_at').notNull(),
});
export const aiOperations = sqliteTable('ai_operations', {
  owner: text('owner').notNull(),
  id: text('id').notNull(),
  feature: text('feature').notNull(),
  week: integer('week').notNull(),
  state: text('state', {enum:['reserved','completed','released']}).notNull(),
  createdAt: integer('created_at').notNull(),
}, t => [primaryKey({columns:[t.owner,t.id]}), index('ai_operations_week').on(t.owner,t.week,t.state)]);
export const vertexBudget = sqliteTable('vertex_budget', {
  project: text('project').primaryKey(),
  day: integer('day').notNull(),
  dailyCount: integer('daily_count').notNull(),
  totalCount: integer('total_count').notNull(),
});
export const vertexUsage=sqliteTable('vertex_usage',{
  id:text('id').primaryKey(),owner:text('owner').notNull(),ownerLabel:text('owner_label').notNull(),
  project:text('project').notNull(),model:text('model').notNull(),location:text('location').notNull(),feature:text('feature').notNull(),operationId:text('operation_id'),
  state:text('state').notNull().default('pending'),inputTokens:integer('input_tokens'),cachedTokens:integer('cached_tokens'),outputTokens:integer('output_tokens'),thinkingTokens:integer('thinking_tokens'),
  estimatedUsd:real('estimated_usd'),pricingVersion:text('pricing_version'),createdAt:integer('created_at').notNull(),updatedAt:integer('updated_at').notNull(),
},t=>[index('vertex_usage_owner_created').on(t.owner,t.createdAt),index('vertex_usage_created').on(t.createdAt)]);
export const cloudCostSnapshots=sqliteTable('cloud_cost_snapshots',{
  project:text('project').notNull(),month:text('month').notNull(),syncedAt:integer('synced_at').notNull(),exportThrough:text('export_through'),
},t=>[primaryKey({columns:[t.project,t.month]})]);
export const cloudCostRows=sqliteTable('cloud_cost_rows',{
  project:text('project').notNull(),month:text('month').notNull(),day:text('day').notNull(),ownerLabel:text('owner_label').notNull(),currency:text('currency').notNull(),cost:real('cost').notNull(),credits:real('credits').notNull(),
},t=>[primaryKey({columns:[t.project,t.month,t.day,t.ownerLabel,t.currency]})]);
export const imports = sqliteTable(
  'import_requests',
  {
    owner: text('owner').notNull(),
    requestId: text('request_id').notNull(),
    fingerprint: text('fingerprint').notNull(),
    noteId: text('note_id'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.owner, t.requestId] }),
    index('imports_created').on(t.createdAt),
  ],
);
