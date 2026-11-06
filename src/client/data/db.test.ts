import { describe, it, expect } from 'vitest';
import { openDatabase, exportDatabase, loadSqlJs } from './db';
import { MIGRATIONS, LATEST_SCHEMA, getSchemaVersion } from './migrations';
import { categories } from '../../db/schema';

describe('in-browser database', () => {
  it('applies all migrations to a new database', async () => {
    const { raw } = await openDatabase();
    expect(getSchemaVersion(raw)).toBe(LATEST_SCHEMA);
    const n = raw.exec('SELECT COUNT(*) FROM __drizzle_migrations')[0]!.values[0]![0];
    expect(n).toBe(MIGRATIONS.length);
    const tables = raw.exec(`SELECT name FROM sqlite_master WHERE type='table'`)[0]!.values.flat();
    expect(tables).toEqual(expect.arrayContaining(['batches', 'categories', 'donors', 'offerings', 'pledges', 'settings', 'statement_emails']));
  });

  it('round-trips through export and reopen without re-migrating', async () => {
    const a = await openDatabase();
    a.db.insert(categories).values({ name: 'General' }).run();
    const bytes = exportDatabase(a);
    const b = await openDatabase(bytes);
    expect(b.db.select().from(categories).all().map((c) => c.name)).toEqual(['General']);
    expect(b.raw.exec('SELECT COUNT(*) FROM __drizzle_migrations')[0]!.values[0]![0]).toBe(MIGRATIONS.length);
  });

  it('upgrades a database at an older schema', async () => {
    const SQL = await loadSqlJs();
    const old = new SQL.Database();
    old.run('CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, hash text NOT NULL, created_at numeric)');
    for (const m of MIGRATIONS.slice(0, 5)) {
      for (const s of m.statements) old.run(s);
      old.run('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)', ['x', m.when]);
    }
    const opened = await openDatabase(old.export());
    expect(getSchemaVersion(opened.raw)).toBe(LATEST_SCHEMA);
    expect(opened.readOnly).toBe(false);
  });

  it('opens a database from a newer app version read-only and refuses to export', async () => {
    const a = await openDatabase();
    a.raw.run('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)', ['future', LATEST_SCHEMA + 1]);
    const b = await openDatabase(a.raw.export());
    expect(b.readOnly).toBe(true);
    expect(() => exportDatabase(b)).toThrow();
  });
});
