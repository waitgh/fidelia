// Storage adapters move opaque (already-encrypted) bytes. They never see plaintext.
export interface StoredVersion {
  id: string;
  savedAt: string; // ISO
  size: number;
}

export interface StorageAdapter {
  readonly kind: 'memory' | 'local-file' | 'google-drive' | 'dropbox';
  /** Human-readable location, e.g. file name or Drive folder. */
  describe(): string;
  /** Returns the current file bytes, or null if nothing has been saved yet. */
  load(): Promise<Uint8Array | null>;
  /** Saves bytes as the current version; implementations keep previous versions where possible. */
  save(bytes: Uint8Array): Promise<void>;
  listVersions(): Promise<StoredVersion[]>;
  loadVersion(id: string): Promise<Uint8Array>;
}

/** A lock record kept next to the church file (e.g. Drive appProperties). */
export interface LockInfo {
  owner: string; // display name, shown to others
  token: string; // random per session
  expiresAt: number; // ms epoch
}

/** Storage that can hold an edit lock. Adapters without one allow editing freely (single-device files). */
export interface LockStore {
  readLock(): Promise<LockInfo | null>;
  writeLock(l: LockInfo | null): Promise<void>;
  /** Page is closing: clear the lock with a `keepalive` request the browser finishes in the background. Best effort. */
  releaseLockOnExit?(): void;
}

export const hasLockStore = (a: unknown): a is LockStore =>
  typeof (a as LockStore)?.readLock === 'function' && typeof (a as LockStore)?.writeLock === 'function';
