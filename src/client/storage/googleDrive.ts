// Google Drive storage adapter (REST, no SDK). Moves ciphertext only.
// Previous versions come from Drive's own revision history.
import type { StorageAdapter, StoredVersion } from './types';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
export const FILE_MIME = 'application/octet-stream';

export class AuthExpiredError extends Error {
  constructor() { super('Your Google sign-in expired. Sign in again to keep saving.'); }
}
export class ConflictError extends Error {
  constructor() { super('Someone else saved the church file since you opened it. Reload to get their changes.'); }
}

type GetToken = () => string | null;

async function call(getToken: GetToken, url: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  if (!token) throw new AuthExpiredError();
  const res = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` } });
  if (res.status === 401) throw new AuthExpiredError();
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(`Google Drive error ${res.status}: ${body?.error?.message ?? res.statusText}`);
  }
  return res;
}

export class GoogleDriveAdapter implements StorageAdapter {
  readonly kind = 'google-drive' as const;
  /** Drive's head revision of the file when we last loaded/saved it; used to detect other writers. */
  private knownVersion: string | null = null;

  constructor(public fileId: string, private name: string, private getToken: GetToken) {}

  describe() { return `Google Drive: ${this.name}`; }

  /** Creates an empty church file in the user's Drive (inside an optional folder). */
  static async create(getToken: GetToken, name: string, parentId?: string): Promise<GoogleDriveAdapter> {
    const res = await call(getToken, `${API}/files?fields=id,name`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: FILE_MIME, parents: parentId ? [parentId] : undefined, appProperties: { fidelia: '1' } }),
    });
    const f = await res.json();
    return new GoogleDriveAdapter(f.id, f.name, getToken);
  }

  /** Church files this app can see (created by it, or opened through the picker). */
  static async list(getToken: GetToken): Promise<{ id: string; name: string; modifiedTime: string }[]> {
    const q = encodeURIComponent("appProperties has { key='fidelia' and value='1' } and trashed=false");
    const res = await call(getToken, `${API}/files?q=${q}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc&pageSize=50`);
    return (await res.json()).files ?? [];
  }

  private async meta(): Promise<{ headRevisionId: string; size?: string; name: string }> {
    return (await call(this.getToken, `${API}/files/${this.fileId}?fields=headRevisionId,size,name`)).json();
  }

  async load(): Promise<Uint8Array | null> {
    const m = await this.meta();
    this.name = m.name;
    if (!m.size || m.size === '0') { this.knownVersion = m.headRevisionId; return null; }
    const res = await call(this.getToken, `${API}/files/${this.fileId}?alt=media`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    this.knownVersion = m.headRevisionId;
    return bytes;
  }

  async save(bytes: Uint8Array): Promise<void> {
    if (this.knownVersion) {
      const m = await this.meta();
      if (m.headRevisionId !== this.knownVersion) throw new ConflictError();
    }
    const res = await call(this.getToken, `${UPLOAD}/files/${this.fileId}?uploadType=media&fields=headRevisionId`, {
      method: 'PATCH',
      headers: { 'Content-Type': FILE_MIME },
      body: bytes as BodyInit,
    });
    this.knownVersion = (await res.json()).headRevisionId ?? null;
  }

  async listVersions(): Promise<StoredVersion[]> {
    const res = await call(this.getToken, `${API}/files/${this.fileId}/revisions?fields=revisions(id,modifiedTime,size)&pageSize=200`);
    const revs: { id: string; modifiedTime: string; size?: string }[] = (await res.json()).revisions ?? [];
    // Newest first, skipping the current revision.
    return revs.slice(0, -1).reverse().map((r) => ({ id: r.id, savedAt: r.modifiedTime, size: Number(r.size ?? 0) }));
  }

  async loadVersion(id: string): Promise<Uint8Array> {
    const res = await call(this.getToken, `${API}/files/${this.fileId}/revisions/${id}?alt=media`);
    return new Uint8Array(await res.arrayBuffer());
  }
}
