// Ported from the old server app: src/server/routes/categories.ts
import { eq } from 'drizzle-orm';
import { categories } from '../../db/schema';
import type { AppDb } from './db';
import { DataError, isUniqueViolation } from './session';

export function listCategories(db: AppDb) {
  return db.select().from(categories).orderBy(categories.name).all();
}

export function createCategory(db: AppDb, data: { name?: string; description?: string | null }) {
  if (!data.name) throw new DataError('Name is required');
  try {
    return db.insert(categories).values({ name: data.name, description: data.description }).returning().get();
  } catch (e) {
    if (isUniqueViolation(e)) throw new DataError('Category name already exists', 409);
    throw e;
  }
}

export function updateCategory(
  db: AppDb,
  id: number,
  data: { name?: string; description?: string | null; isActive?: boolean },
) {
  const updates: Partial<typeof categories.$inferInsert> = {};
  if (data.name !== undefined) updates.name = data.name;
  if (data.description !== undefined) updates.description = data.description;
  if (data.isActive !== undefined) updates.isActive = data.isActive;
  if (!Object.keys(updates).length) {
    const row = db.select().from(categories).where(eq(categories.id, id)).get();
    if (!row) throw new DataError('Category not found', 404);
    return row;
  }
  try {
    const row = db.update(categories).set(updates).where(eq(categories.id, id)).returning().get();
    if (!row) throw new DataError('Category not found', 404);
    return row;
  } catch (e) {
    if (isUniqueViolation(e)) throw new DataError('Category name already exists', 409);
    throw e;
  }
}
