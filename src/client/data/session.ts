// Holds the currently open church database and notifies listeners on change
// (autosave subscribes here).
import type { AppDb, OpenedDb } from './db';

let current: OpenedDb | null = null;
const listeners = new Set<() => void>();

export class DataError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export function setSession(db: OpenedDb | null) {
  current = db;
}

export function getSession(): OpenedDb {
  if (!current) throw new DataError('No database is open', 401);
  return current;
}

export function getDb(): AppDb {
  return getSession().db;
}

/** Call after every write. */
export function markDirty() {
  if (current?.readOnly) throw new DataError('This database is read-only', 403);
  listeners.forEach((l) => l());
}

export function onDirty(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function isUniqueViolation(e: unknown): boolean {
  return e instanceof Error && e.message.includes('UNIQUE constraint');
}
