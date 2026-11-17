// Small IndexedDB store: the last church location (file handle / cloud file id),
// any not-yet-uploaded save, and the non-extractable per-tab keys used to stay signed in
// across a refresh (church/resume.ts). Never plaintext church data or raw keys.
const DB = 'fidelia';
const STORE = 'recent';

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export interface RecentChurch {
  kind: 'local-file' | 'google-drive' | 'dropbox';
  label: string;
  /** FileSystemFileHandle for local files; cloud file id/path otherwise. */
  ref: unknown;
}

async function kvGet<T>(key: string): Promise<T | null> {
  try { return ((await tx('readonly', (s) => s.get(key))) as T) ?? null; } catch { return null; }
}

async function kvSet(key: string, v: unknown) {
  try { await tx<unknown>('readwrite', (s) => (v == null ? s.delete(key) : s.put(v, key)) as IDBRequest<unknown>); } catch { /* storage may be blocked */ }
}

export const kvGetAny = <T>(key: string) => kvGet<T>(key);
export const kvSetAny = (key: string, v: unknown) => kvSet(key, v);
export async function kvKeys(prefix: string): Promise<string[]> {
  try {
    const keys = await tx('readonly', (s) => s.getAllKeys());
    return keys.map(String).filter((k) => k.startsWith(prefix));
  } catch { return []; }
}

export const getRecent = () => kvGet<RecentChurch>('last');
export const setRecent = (r: RecentChurch | null) => kvSet('last', r);

/**
 * Encrypted file bytes that could not be uploaded (e.g. sign-in expired). Ciphertext only.
 * Uploaded on the next unlock of the same church.
 */
export interface PendingSave { file: Uint8Array; savedAt: string }
export const getPendingSave = (churchId: string) => kvGet<PendingSave>(`pending:${churchId}`);
export const setPendingSave = (churchId: string, p: PendingSave | null) => kvSet(`pending:${churchId}`, p);
