import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, type AppDb } from './db';
import { listCategories, createCategory, updateCategory } from './categories';

let db: AppDb;
beforeEach(async () => { db = (await openDatabase()).db; });

describe('categories', () => {
  it('creates and lists sorted by name', () => {
    createCategory(db, { name: 'Missions' });
    createCategory(db, { name: 'General', description: 'Tithes' });
    expect(listCategories(db).map((c) => c.name)).toEqual(['General', 'Missions']);
    expect(listCategories(db)[0]!.isActive).toBe(true);
  });
  it('rejects missing and duplicate names', () => {
    expect(() => createCategory(db, {})).toThrow('Name is required');
    createCategory(db, { name: 'A' });
    expect(() => createCategory(db, { name: 'A' })).toThrow('already exists');
  });
  it('updates and reports not found', () => {
    const c = createCategory(db, { name: 'A' });
    expect(updateCategory(db, c.id, { isActive: false }).isActive).toBe(false);
    expect(() => updateCategory(db, 999, { name: 'X' })).toThrow('not found');
  });
});
