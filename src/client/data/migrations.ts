// Applies src/db/migrations to an in-browser SQLite database.
// Tracking is compatible with drizzle's own migrator (`__drizzle_migrations`,
// created_at = journal `when`), so databases created by the old server app
// open and upgrade cleanly.
import type { Database } from 'sql.js';
import journal from '../../db/migrations/meta/_journal.json';

const sqlFiles = import.meta.glob('../../db/migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export interface Migration {
  tag: string;
  when: number;
  statements: string[];
  sql: string;
}

export const MIGRATIONS: Migration[] = journal.entries.map((e) => {
  const key = Object.keys(sqlFiles).find((k) => k.endsWith(`/${e.tag}.sql`));
  if (!key) throw new Error(`Missing migration file for ${e.tag}`);
  const sql = sqlFiles[key]!;
  return {
    tag: e.tag,
    when: e.when,
    sql,
    statements: sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean),
  };
});

export const LATEST_SCHEMA = MIGRATIONS[MIGRATIONS.length - 1]!.when;

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function getSchemaVersion(db: Database): number | null {
  const t = db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'`);
  if (!t.length) return null;
  const r = db.exec(`SELECT MAX(CAST(created_at AS INTEGER)) FROM __drizzle_migrations`);
  const v = r[0]?.values[0]?.[0];
  return v == null ? null : Number(v);
}

export class SchemaTooNewError extends Error {
  constructor(public dbVersion: number) {
    super('This database was saved by a newer version of the app. Please reload to update before editing.');
  }
}

/** Applies pending migrations in one transaction. Returns tags applied. */
export async function migrate(db: Database): Promise<string[]> {
  const current = getSchemaVersion(db) ?? 0;
  if (current > LATEST_SCHEMA) throw new SchemaTooNewError(current);
  const pending = MIGRATIONS.filter((m) => m.when > current);
  if (!pending.length) return [];
  const hashes = await Promise.all(pending.map((m) => sha256Hex(m.sql)));
  db.run('PRAGMA foreign_keys = OFF');
  db.run('BEGIN');
  try {
    db.run(`CREATE TABLE IF NOT EXISTS __drizzle_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, hash text NOT NULL, created_at numeric)`);
    pending.forEach((m, i) => {
      for (const s of m.statements) db.run(s);
      db.run('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)', [hashes[i]!, m.when]);
    });
    db.run('COMMIT');
  } catch (e) {
    db.run('ROLLBACK');
    throw e;
  } finally {
    db.run('PRAGMA foreign_keys = ON');
  }
  return pending.map((m) => m.tag);
}
