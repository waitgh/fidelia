// Ported from the old server app: src/server/routes/offerings.ts
import { and, desc, eq, getTableColumns, gte, isNotNull, lte, sql } from 'drizzle-orm';
import { batches, categories, donors, offerings } from '../../db/schema';
import { calculateOfferingFee } from '../../shared/lib/offering-fees';
import type { AppDb } from './db';
import { DataError } from './session';

export interface OfferingFilters {
  batchId?: string | number;
  donorId?: string | number;
  categoryId?: string | number;
  startDate?: string;
  endDate?: string;
}

export function listOfferings(db: AppDb, f: OfferingFilters = {}) {
  const c = [];
  if (f.batchId) c.push(eq(offerings.batchId, Number(f.batchId)));
  if (f.donorId) c.push(eq(offerings.donorId, Number(f.donorId)));
  if (f.categoryId) c.push(eq(offerings.categoryId, Number(f.categoryId)));
  if (f.startDate) c.push(gte(batches.date, f.startDate));
  if (f.endDate) c.push(lte(batches.date, f.endDate));
  return db
    .select({
      ...getTableColumns(offerings),
      donorFirstName: donors.firstName,
      donorLastName: donors.lastName,
      categoryName: categories.name,
      batchDate: batches.date,
    })
    .from(offerings)
    .innerJoin(donors, eq(offerings.donorId, donors.id))
    .innerJoin(categories, eq(offerings.categoryId, categories.id))
    .innerJoin(batches, eq(offerings.batchId, batches.id))
    .where(c.length ? and(...c) : undefined)
    .orderBy(batches.date, donors.lastName)
    .all();
}

function categoryName(db: AppDb, id: number) {
  return db.select({ name: categories.name }).from(categories).where(eq(categories.id, id)).get()?.name;
}

/** Trimmed designation, or null for blank. */
function designationValue(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? s.slice(0, 100) : null;
}

/** Designations used before (for suggestions), most used first. */
export function listDesignations(db: AppDb): string[] {
  return db
    .select({ designation: offerings.designation })
    .from(offerings)
    .where(and(isNotNull(offerings.designation), sql`trim(${offerings.designation}) <> ''`))
    .groupBy(offerings.designation)
    .orderBy(desc(sql`count(*)`), offerings.designation)
    .all()
    .map((r) => r.designation!);
}

function positiveAmount(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) throw new DataError('Amount must be positive');
  return n;
}

export function createOffering(db: AppDb, data: Record<string, any>) {
  const { batchId, donorId, categoryId, amount, paymentMethod, checkNumber, notes } = data;
  if (!batchId || !donorId || !categoryId || amount === undefined || !paymentMethod) {
    throw new DataError('batchId, donorId, categoryId, amount, and paymentMethod are required');
  }
  const amt = positiveAmount(amount);
  const batch = db.select().from(batches).where(eq(batches.id, Number(batchId))).get();
  if (!batch) throw new DataError('Batch not found', 404);
  if (batch.status === 'closed') throw new DataError('Cannot add offerings to a closed batch');
  return db
    .insert(offerings)
    .values({
      batchId: Number(batchId),
      donorId: Number(donorId),
      categoryId: Number(categoryId),
      amount: amt,
      feeAmount: calculateOfferingFee(amt, String(paymentMethod), categoryName(db, Number(categoryId))),
      paymentMethod,
      checkNumber: checkNumber || null,
      notes: notes || null,
      designation: designationValue(data.designation),
    })
    .returning()
    .get();
}

function requireOpenOffering(db: AppDb, id: number, verb: string) {
  const offering = db.select().from(offerings).where(eq(offerings.id, id)).get();
  if (!offering) throw new DataError('Offering not found', 404);
  const batch = db.select().from(batches).where(eq(batches.id, offering.batchId)).get();
  if (batch?.status === 'closed') {
    throw new DataError(`Cannot ${verb} offerings ${verb === 'delete' ? 'from' : 'in'} a closed batch. Reopen the batch first.`);
  }
  return offering;
}

export function updateOffering(db: AppDb, id: number, data: Record<string, any>) {
  const offering = requireOpenOffering(db, id, 'modify');
  const updates: Partial<typeof offerings.$inferInsert> = { updatedAt: new Date().toISOString() };
  if (data.donorId !== undefined) updates.donorId = Number(data.donorId);
  if (data.categoryId !== undefined) updates.categoryId = Number(data.categoryId);
  if (data.amount !== undefined) updates.amount = positiveAmount(data.amount);
  if (data.paymentMethod !== undefined) updates.paymentMethod = data.paymentMethod;
  if (data.checkNumber !== undefined) updates.checkNumber = data.checkNumber || null;
  if (data.notes !== undefined) updates.notes = data.notes || null;
  if (data.designation !== undefined) updates.designation = designationValue(data.designation);
  updates.feeAmount = calculateOfferingFee(
    updates.amount ?? offering.amount,
    String(updates.paymentMethod ?? offering.paymentMethod),
    categoryName(db, updates.categoryId ?? offering.categoryId),
  );
  return db.update(offerings).set(updates).where(eq(offerings.id, id)).returning().get();
}

export function reassignOffering(db: AppDb, id: number, batchId: number) {
  if (!batchId) throw new DataError('batchId is required');
  const offering = db.select().from(offerings).where(eq(offerings.id, id)).get();
  if (!offering) throw new DataError('Offering not found', 404);
  const target = db.select().from(batches).where(eq(batches.id, Number(batchId))).get();
  if (!target) throw new DataError('Target batch not found', 404);
  return db
    .update(offerings)
    .set({ batchId: Number(batchId), updatedAt: new Date().toISOString() })
    .where(eq(offerings.id, id))
    .returning()
    .get();
}

export function deleteOffering(db: AppDb, id: number) {
  requireOpenOffering(db, id, 'delete');
  db.delete(offerings).where(eq(offerings.id, id)).run();
  return { success: true };
}
