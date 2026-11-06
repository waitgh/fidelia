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
