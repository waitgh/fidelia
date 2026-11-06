// Local-file adapter for development, using the File System Access API
// (Chromium). Previous versions are kept in-memory for the session only.
import type { StorageAdapter, StoredVersion } from './types';

type FileHandle = {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(d: BufferSource | Blob): Promise<void>; close(): Promise<void> }>;
};

export class LocalFileAdapter implements StorageAdapter {
  readonly kind = 'local-file' as const;
  private history: { v: StoredVersion; bytes: Uint8Array }[] = [];
  constructor(private handle: FileHandle) {}

  static supported(): boolean {
    return typeof window !== 'undefined' && 'showSaveFilePicker' in window;
  }

  static async create(suggestedName = 'church.fidelia'): Promise<LocalFileAdapter> {
    const h = await (window as any).showSaveFilePicker({ suggestedName });
    return new LocalFileAdapter(h);
  }

  static async open(): Promise<LocalFileAdapter> {
    const [h] = await (window as any).showOpenFilePicker();
    return new LocalFileAdapter(h);
  }

  describe() { return this.handle.name; }

  async load() {
    const f = await this.handle.getFile();
    if (f.size === 0) return null;
    return new Uint8Array(await f.arrayBuffer());
  }

  async save(bytes: Uint8Array) {
    const prev = await this.load();
    if (prev) {
      this.history.push({ v: { id: String(Date.now()), savedAt: new Date().toISOString(), size: prev.length }, bytes: prev });
      if (this.history.length > 10) this.history.shift();
    }
    const w = await this.handle.createWritable();
    await w.write(bytes as BufferSource);
    await w.close();
  }

  async listVersions() { return this.history.map((x) => x.v).reverse(); }
  async loadVersion(id: string) {
    const f = this.history.find((x) => x.v.id === id);
    if (!f) throw new Error('Version not found');
    return f.bytes;
  }
}
