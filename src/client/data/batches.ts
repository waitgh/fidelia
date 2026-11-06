// Ported from the old server app: src/server/routes/batches.ts
import { count, desc, eq, getTableColumns, sql } from 'drizzle-orm';
import { batches, categories, donors, offerings } from '../../db/schema';
import type { AppDb } from './db';
import { DataError } from './session';

export function listBatches(db: AppDb, params: { limit?: number; offset?: number; description?: string } = {}) {
  const limit = Math.min(Number(params.limit ?? 20), 100);
  const offset = Number(params.offset ?? 0);
  const search = params.description?.trim() ?? '';
  const where = search
    ? sql`lower(coalesce(${batches.description}, '')) like ${'%' + search.toLowerCase() + '%'}`
    : undefined;
  const rows = db
    .select({
      ...getTableColumns(batches),
      totalAmount: sql<number>`coalesce(sum(${offerings.amount}), 0)`,
      offeringCount: sql<number>`count(${offerings.id})`,
    })
    .from(batches)
    .leftJoin(offerings, eq(batches.id, offerings.batchId))
    .where(where)
    .groupBy(batches.id)
    .orderBy(desc(batches.date))
    .limit(limit)
    .offset(offset)
    .all();
  const total = db.select({ total: count() }).from(batches).where(where).get()?.total ?? 0;
  return { rows, total };
}

function requireBatch(db: AppDb, id: number) {
  const batch = db.select().from(batches).where(eq(batches.id, id)).get();
  if (!batch) throw new DataError('Batch not found', 404);
  return batch;
}

export function getBatch(db: AppDb, id: number) {
  const batch = requireBatch(db, id);
  const rows = db
    .select({
      ...getTableColumns(offerings),
      donorFirstName: donors.firstName,
      donorLastName: donors.lastName,
      donorCongregation: donors.congregation,
      categoryName: categories.name,
    })
    .from(offerings)
    .innerJoin(donors, eq(offerings.donorId, donors.id))
    .innerJoin(categories, eq(offerings.categoryId, categories.id))
    .where(eq(offerings.batchId, id))
    .orderBy(donors.lastName, donors.firstName)
    .all();
  const totalAmount = rows.reduce((s, o) => s + o.amount, 0);
  return { ...batch, offerings: rows, totalAmount, offeringCount: rows.length };
}

export function createBatch(db: AppDb, data: { date?: string; description?: string | null }) {
  if (!data.date) throw new DataError('Date is required');
  return db.insert(batches).values({ date: data.date, description: data.description }).returning().get();
}

function setBatch(db: AppDb, id: number, updates: Partial<typeof batches.$inferInsert>) {
  if (!Object.keys(updates).length) return requireBatch(db, id);
  const row = db.update(batches).set(updates).where(eq(batches.id, id)).returning().get();
  if (!row) throw new DataError('Batch not found', 404);
  return row;
}

export function updateBatch(db: AppDb, id: number, data: { date?: string; description?: string | null }) {
  const updates: Partial<typeof batches.$inferInsert> = {};
  if (data.date !== undefined) updates.date = data.date;
  if (data.description !== undefined) updates.description = data.description;
  return setBatch(db, id, updates);
}

export const closeBatch = (db: AppDb, id: number) =>
  setBatch(db, id, { status: 'closed', closedAt: new Date().toISOString() });

export const reopenBatch = (db: AppDb, id: number) => setBatch(db, id, { status: 'open', closedAt: null });

export function deleteBatch(db: AppDb, id: number) {
  requireBatch(db, id);
  db.transaction((tx) => {
    tx.delete(offerings).where(eq(offerings.batchId, id)).run();
    tx.delete(batches).where(eq(batches.id, id)).run();
  });
  return { success: true };
}
