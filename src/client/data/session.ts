// Holds the currently open church database and notifies listeners on change
// (autosave subscribes here).
import type { AppDb, OpenedDb } from './db';

let current: OpenedDb | null = null;
let userName = '';

/** Display name of the person using this browser (recorded on sends). */
export const setUserName = (n: string) => { userName = n; };
export const getUserName = () => userName;
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

let readOnlyCheck: () => boolean = () => !!current?.readOnly;
/** Lets the session owner add conditions (viewer role, someone else holds the edit lock). */
export const setReadOnlyCheck = (fn: () => boolean) => { readOnlyCheck = fn; };

/** Call before every write. */
export function assertWritable() {
  if (readOnlyCheck()) throw new DataError('Read-only: you cannot make changes right now', 403);
}

/** Call after every write. */
export function markDirty() {
  listeners.forEach((l) => l());
}

export function onDirty(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function isUniqueViolation(e: unknown): boolean {
  return e instanceof Error && e.message.includes('UNIQUE constraint');
}
