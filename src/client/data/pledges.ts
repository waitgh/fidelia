// Ported from the old server app: src/server/routes/pledges.ts
import { and, eq, getTableColumns, gte, lte, sql } from 'drizzle-orm';
import { batches, categories, donors, offerings, pledges } from '../../db/schema';
import type { AppDb } from './db';
import { DataError } from './session';

/** Total given toward a pledge: same donor + category, batch date within the pledge range. */
export function computeGiven(db: AppDb, donorId: number, categoryId: number, startDate: string, endDate: string) {
  return (
    db
      .select({ total: sql<number>`coalesce(sum(${offerings.amount}), 0)` })
      .from(offerings)
      .innerJoin(batches, eq(offerings.batchId, batches.id))
      .where(
        and(
          eq(offerings.donorId, donorId),
          eq(offerings.categoryId, categoryId),
          gte(batches.date, startDate),
          lte(batches.date, endDate),
        ),
      )
      .get()?.total ?? 0
  );
}

function baseQuery(db: AppDb) {
  return db
    .select({
      ...getTableColumns(pledges),
      donorFirstName: donors.firstName,
      donorLastName: donors.lastName,
      donorSpouseName: donors.spouseName,
      categoryName: categories.name,
    })
    .from(pledges)
    .innerJoin(donors, eq(pledges.donorId, donors.id))
    .innerJoin(categories, eq(pledges.categoryId, categories.id));
}

function withFulfillment<T extends { donorId: number; categoryId: number; amount: number; startDate: string; endDate: string }>(db: AppDb, p: T) {
  const givenAmount = computeGiven(db, p.donorId, p.categoryId, p.startDate, p.endDate);
  return { ...p, givenAmount, fulfillmentPct: p.amount > 0 ? Math.round((givenAmount / p.amount) * 100) : 0 };
}

export function listPledges(db: AppDb, f: { donorId?: string | number; year?: string | number } = {}) {
  const c = [];
  if (f.donorId) c.push(eq(pledges.donorId, Number(f.donorId)));
  if (f.year) {
    c.push(gte(pledges.startDate, `${f.year}-01-01`));
    c.push(lte(pledges.endDate, `${f.year}-12-31`));
  }
  return baseQuery(db)
    .where(c.length ? and(...c) : undefined)
    .orderBy(donors.lastName, donors.firstName)
    .all()
    .map((p) => withFulfillment(db, p));
}

export function getPledge(db: AppDb, id: number) {
  const p = baseQuery(db).where(eq(pledges.id, id)).get();
  if (!p) throw new DataError('Pledge not found', 404);
  return withFulfillment(db, p);
}

export function createPledge(db: AppDb, data: Record<string, any>) {
  const { donorId, categoryId, amount, startDate, endDate, notes } = data;
  if (!donorId || !categoryId || !amount || !startDate || !endDate) {
    throw new DataError('donorId, categoryId, amount, startDate, and endDate are required');
  }
  if (!(Number(amount) > 0)) throw new DataError('Amount must be positive');
  return db
    .insert(pledges)
    .values({ donorId: Number(donorId), categoryId: Number(categoryId), amount: Number(amount), startDate, endDate, notes: notes || null })
    .returning()
    .get();
}

export function updatePledge(db: AppDb, id: number, data: Record<string, any>) {
  const u: Partial<typeof pledges.$inferInsert> = { updatedAt: new Date().toISOString() };
  if (data.donorId !== undefined) u.donorId = Number(data.donorId);
  if (data.categoryId !== undefined) u.categoryId = Number(data.categoryId);
  if (data.amount !== undefined) {
    u.amount = Number(data.amount);
    if (!(u.amount > 0)) throw new DataError('Amount must be positive');
  }
  if (data.startDate !== undefined) u.startDate = data.startDate;
  if (data.endDate !== undefined) u.endDate = data.endDate;
  if (data.notes !== undefined) u.notes = data.notes || null;
  const row = db.update(pledges).set(u).where(eq(pledges.id, id)).returning().get();
  if (!row) throw new DataError('Pledge not found', 404);
  return row;
}

export function deletePledge(db: AppDb, id: number) {
  const p = db.select({ id: pledges.id }).from(pledges).where(eq(pledges.id, id)).get();
  if (!p) throw new DataError('Pledge not found', 404);
  db.delete(pledges).where(eq(pledges.id, id)).run();
  return { success: true };
}
