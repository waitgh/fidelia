import type { LockInfo, LockStore, StorageAdapter, StoredVersion } from './types';

/** In-memory adapter for tests and demo mode. Keeps the last `keep` versions. */
export class MemoryAdapter implements StorageAdapter, LockStore {
  lock: LockInfo | null = null;
  async readLock() { return this.lock; }
  async writeLock(l: LockInfo | null) { this.lock = l; }
  releaseLockOnExit() { this.lock = null; }
  readonly kind = 'memory' as const;
  private versions: { v: StoredVersion; bytes: Uint8Array }[] = [];
  private seq = 0;
  constructor(private keep = 10) {}
  describe() { return 'In-memory (not saved)'; }
  async load() { return this.versions.at(-1)?.bytes.slice() ?? null; }
  async save(bytes: Uint8Array) {
    this.versions.push({ v: { id: String(++this.seq), savedAt: new Date().toISOString(), size: bytes.length }, bytes: bytes.slice() });
    if (this.versions.length > this.keep) this.versions.splice(0, this.versions.length - this.keep);
  }
  async listVersions() { return this.versions.map((x) => x.v).reverse(); }
  async loadVersion(id: string) {
    const f = this.versions.find((x) => x.v.id === id);
    if (!f) throw new Error('Version not found');
    return f.bytes.slice();
  }
}
