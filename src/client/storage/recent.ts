// Remembers the last church location in this browser (IndexedDB). Stores only a
// file handle or a cloud file reference, never church data or keys.
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

export async function getRecent(): Promise<RecentChurch | null> {
  try { return (await tx('readonly', (s) => s.get('last'))) ?? null; } catch { return null; }
}

export async function setRecent(r: RecentChurch | null) {
  try { await tx<unknown>('readwrite', (s) => (r ? s.put(r, 'last') : s.delete('last')) as IDBRequest<unknown>); } catch { /* storage may be blocked */ }
}
