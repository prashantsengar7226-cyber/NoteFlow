import {
  sqliteTable,
  text,
  integer,
  index,
  primaryKey,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
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
