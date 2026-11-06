// Ported from the old server app: src/server/routes/donors.ts
import { and, desc, eq, getTableColumns, or, sql } from 'drizzle-orm';
import { donors, offerings, pledges } from '../../db/schema';
import type { AppDb } from './db';
import { DataError, isUniqueViolation } from './session';

const EDITABLE = [
  'firstName', 'lastName', 'spouseName', 'chineseName', 'congregation', 'email', 'phone',
  'address', 'city', 'state', 'zipCode', 'envelopeNumber', 'notes', 'isActive',
] as const;
type DonorInput = Partial<Pick<typeof donors.$inferInsert, (typeof EDITABLE)[number]>>;

function pick(data: Record<string, unknown>): DonorInput {
  const out: Record<string, unknown> = {};
  for (const k of EDITABLE) if (data[k] !== undefined) out[k] = data[k];
  return out as DonorInput;
}

export function listDonors(db: AppDb, search?: string, showInactive = false) {
  search = search?.trim();
  const d = donors;
  const conditions = [];
  if (!showInactive) conditions.push(eq(d.isActive, true));
  if (search) {
    const normalized = search.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
    // A non-Latin search (e.g. Chinese) normalizes to '', which would match everyone.
    // Fall back to the raw (lowercased) text so it only matches real substrings.
    const term = `%${normalized || search.toLowerCase()}%`;
    const rawTerm = `%${search}%`;
    conditions.push(
      or(
        sql`lower(${d.firstName}) like ${term}`,
        sql`lower(${d.lastName}) like ${term}`,
        sql`lower(coalesce(${d.spouseName}, '')) like ${term}`,
        sql`lower(coalesce(${d.congregation}, '')) like ${term}`,
        sql`lower(coalesce(${d.email}, '')) like ${term}`,
        sql`lower(coalesce(${d.envelopeNumber}, '')) like ${term}`,
        sql`lower(trim(${d.firstName} || ' ' || ${d.lastName})) like ${term}`,
        sql`lower(trim(${d.lastName} || ' ' || ${d.firstName})) like ${term}`,
        sql`lower(coalesce(${d.chineseName}, '')) like ${term}`,
        sql`coalesce(${d.chineseName}, '') like ${rawTerm}`,
        sql`lower(trim(${d.lastName} || ' ' || coalesce(${d.chineseName}, ''))) like ${term}`,
        sql`lower(trim(coalesce(${d.chineseName}, '') || ' ' || ${d.lastName})) like ${term}`,
        sql`trim(${d.lastName} || ' ' || coalesce(${d.chineseName}, '')) like ${rawTerm}`,
        sql`trim(coalesce(${d.chineseName}, '') || ' ' || ${d.lastName}) like ${rawTerm}`,
      )!,
    );
  }
  const count = sql<number>`count(${offerings.id})`;
  const q = db
    .select({ ...getTableColumns(d), offeringCount: count })
    .from(d)
    .leftJoin(offerings, eq(offerings.donorId, d.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .groupBy(d.id);
  return search ? q.orderBy(desc(count), d.lastName, d.firstName).all() : q.orderBy(d.lastName, d.firstName).all();
}

export function isEnvelopeTaken(db: AppDb, envelopeNumber: string, excludeId?: number) {
  if (!envelopeNumber) return { taken: false };
  const match = db.select({ id: donors.id }).from(donors).where(eq(donors.envelopeNumber, envelopeNumber)).get();
  return { taken: match ? match.id !== excludeId : false };
}

export function getDonor(db: AppDb, id: number) {
  const donor = db.select().from(donors).where(eq(donors.id, id)).get();
  if (!donor) throw new DataError('Donor not found', 404);
  return donor;
}

export function createDonor(db: AppDb, data: Record<string, unknown>) {
  const values = pick(data);
  if (!values.firstName || !values.lastName) throw new DataError('First name and last name are required');
  try {
    return db.insert(donors).values(values as typeof donors.$inferInsert).returning().get();
  } catch (e) {
    if (isUniqueViolation(e)) throw new DataError('Envelope number already in use', 409);
    throw e;
  }
}

export function updateDonor(db: AppDb, id: number, data: Record<string, unknown>) {
  try {
    const row = db
      .update(donors)
      .set({ ...pick(data), updatedAt: new Date().toISOString() })
      .where(eq(donors.id, id))
      .returning()
      .get();
    if (!row) throw new DataError('Donor not found', 404);
    return row;
  } catch (e) {
    if (isUniqueViolation(e)) throw new DataError('Envelope number already in use', 409);
    throw e;
  }
}

export function deleteDonor(db: AppDb, id: number) {
  getDonor(db, id);
  const hasOfferings = db.select({ id: offerings.id }).from(offerings).where(eq(offerings.donorId, id)).get();
  const hasPledges = db.select({ id: pledges.id }).from(pledges).where(eq(pledges.donorId, id)).get();
  if (hasOfferings || hasPledges) {
    throw new DataError('This donor has offerings or pledges on record and cannot be deleted. Mark them inactive instead.', 409);
  }
  db.delete(donors).where(eq(donors.id, id)).run();
  return { ok: true };
}
