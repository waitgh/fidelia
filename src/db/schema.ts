import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const donors = sqliteTable(
  'donors',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    email: text('email'),
    phone: text('phone'),
    address: text('address'),
    city: text('city'),
    state: text('state'),
    zipCode: text('zip_code'),
    spouseName: text('spouse_name'),
    chineseName: text('chinese_name'),
    congregation: text('congregation'),
    envelopeNumber: text('envelope_number').unique(),
    notes: text('notes'),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => ({
    nameIdx: index('idx_donors_name').on(table.lastName, table.firstName),
    envelopeIdx: index('idx_donors_envelope').on(table.envelopeNumber),
  }),
);

export const categories = sqliteTable('categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  description: text('description'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const batches = sqliteTable(
  'batches',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    date: text('date').notNull(),
    description: text('description'),
    status: text('status').notNull().default('open'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    closedAt: text('closed_at'),
  },
  (table) => ({
    dateIdx: index('idx_batches_date').on(table.date),
    statusIdx: index('idx_batches_status').on(table.status),
  }),
);

export const pledges = sqliteTable(
  'pledges',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    donorId: integer('donor_id')
      .notNull()
      .references(() => donors.id),
    categoryId: integer('category_id')
      .notNull()
      .references(() => categories.id),
    amount: real('amount').notNull(),
    startDate: text('start_date').notNull(),
    endDate: text('end_date').notNull(),
    notes: text('notes'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => ({
    donorIdx: index('idx_pledges_donor').on(table.donorId),
    categoryIdx: index('idx_pledges_category').on(table.categoryId),
    dateIdx: index('idx_pledges_dates').on(table.startDate, table.endDate),
  }),
);

export const offerings = sqliteTable(
  'offerings',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    batchId: integer('batch_id')
      .notNull()
      .references(() => batches.id),
    donorId: integer('donor_id')
      .notNull()
      .references(() => donors.id),
    categoryId: integer('category_id')
      .notNull()
      .references(() => categories.id),
    amount: real('amount').notNull(),
    feeAmount: real('fee_amount'),
    paymentMethod: text('payment_method').notNull(),
    checkNumber: text('check_number'),
    notes: text('notes'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => ({
    batchIdx: index('idx_offerings_batch').on(table.batchId),
    donorIdx: index('idx_offerings_donor').on(table.donorId),
    categoryIdx: index('idx_offerings_category').on(table.categoryId),
    dateIdx: index('idx_offerings_payment_method').on(table.paymentMethod),
  }),
);

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  displayName: text('display_name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('viewer'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

/** One row per attempt to email a donor their contribution statement. */
export const statementEmails = sqliteTable(
  'statement_emails',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    donorId: integer('donor_id')
      .notNull()
      .references(() => donors.id),
    periodStart: text('period_start').notNull(),
    periodEnd: text('period_end').notNull(),
    email: text('email').notNull(),
    /** 'sent' | 'failed' | 'dry_run' */
    status: text('status').notNull(),
    error: text('error'),
    sentBy: text('sent_by').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => ({
    donorPeriodIdx: index('idx_statement_emails_donor_period').on(table.donorId, table.periodStart, table.periodEnd),
  }),
);
