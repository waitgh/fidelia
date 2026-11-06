// In-browser SQLite (sql.js WASM) + Drizzle. One open database at a time.
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import { drizzle, type SQLJsDatabase } from 'drizzle-orm/sql-js';
import * as schema from '../../db/schema';
import { migrate, SchemaTooNewError } from './migrations';

export type AppDb = SQLJsDatabase<typeof schema>;

let sqlPromise: Promise<SqlJsStatic> | null = null;

/** Loads the sql.js WASM. In the browser the .wasm is served by Vite; in Node (tests) it resolves from node_modules. */
export function loadSqlJs(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    sqlPromise = (async () => {
      if (typeof window === 'undefined') return initSqlJs();
      const { default: wasmUrl } = await import('sql.js/dist/sql-wasm.wasm?url');
      return initSqlJs({ locateFile: () => wasmUrl });
    })();
  }
  return sqlPromise;
}

export interface OpenedDb {
  raw: Database;
  db: AppDb;
  /** True when the file came from a newer app version: never save it. */
  readOnly: boolean;
}

export async function openDatabase(bytes?: Uint8Array): Promise<OpenedDb> {
  const SQL = await loadSqlJs();
  const raw = bytes ? new SQL.Database(bytes) : new SQL.Database();
  raw.run('PRAGMA foreign_keys = ON');
  let readOnly = false;
  try {
    await migrate(raw);
  } catch (e) {
    if (e instanceof SchemaTooNewError) readOnly = true;
    else {
      raw.close();
      throw e;
    }
  }
  return { raw, db: drizzle(raw, { schema }), readOnly };
}

export function integrityCheck(raw: Database): boolean {
  const r = raw.exec('PRAGMA integrity_check');
  return r[0]?.values[0]?.[0] === 'ok';
}

/** Serializes the database after an integrity check. Throws if the check fails. */
export function exportDatabase(opened: OpenedDb): Uint8Array {
  if (opened.readOnly) throw new SchemaTooNewError(0);
  if (!integrityCheck(opened.raw)) throw new Error('Integrity check failed; refusing to save.');
  return opened.raw.export();
}
