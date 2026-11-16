// Dropbox storage adapter + PKCE redirect sign-in (no SDK, no client secret).
// Moves ciphertext only. Conflicts are detected by Dropbox itself (upload mode=update with rev);
// previous versions come from Dropbox revisions; the edit lock is a small sibling file.
import type { LockInfo, LockStore, StorageAdapter, StoredVersion } from './types';
import { AuthExpiredError, ConflictError } from './googleDrive';

const API = 'https://api.dropboxapi.com/2';
const CONTENT = 'https://content.dropboxapi.com/2';
const KEY = 'fidelia.dropbox.token';
export const dropboxAppKey = (): string | undefined => import.meta.env.VITE_DROPBOX_APP_KEY || undefined;

interface Tok { access: string; refresh?: string; expiresAt: number }

const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
/** Dropbox-API-Arg must be ASCII: escape non-ASCII characters. */
const apiArg = (o: unknown) => JSON.stringify(o).replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);

function readTok(): Tok | null {
  try { return JSON.parse(sessionStorage.getItem(KEY) ?? 'null'); } catch { return null; }
}
function writeTok(t: Tok | null) {
  try { t ? sessionStorage.setItem(KEY, JSON.stringify(t)) : sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}
export const hasDropboxSession = () => readTok() !== null;

export async function startDropboxSignIn() {
  if (!dropboxAppKey()) throw new Error('Dropbox is not configured for this site (missing VITE_DROPBOX_APP_KEY)');
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  const state = crypto.randomUUID();
  sessionStorage.setItem('fidelia.dropbox.pkce', JSON.stringify({ verifier, state }));
  location.assign(`https://www.dropbox.com/oauth2/authorize?${new URLSearchParams({
    client_id: dropboxAppKey()!, response_type: 'code', redirect_uri: `${location.origin}/`, state,
    code_challenge: challenge, code_challenge_method: 'S256', token_access_type: 'offline',
  })}`);
}

async function tokenRequest(body: Record<string, string>): Promise<Tok> {
  const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: dropboxAppKey()!, ...body }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`Dropbox sign-in failed: ${j.error_description ?? j.error ?? res.status}`);
  return { access: j.access_token, refresh: j.refresh_token ?? body.refresh_token, expiresAt: Date.now() + j.expires_in * 1000 };
}

/** Call at startup: finishes a Dropbox redirect if the URL has ?code=…&state=… from us. */
export async function completeDropboxSignIn(): Promise<boolean> {
  const q = new URLSearchParams(location.search);
  let saved: { verifier: string; state: string } | null = null;
  try { saved = JSON.parse(sessionStorage.getItem('fidelia.dropbox.pkce') ?? 'null'); } catch { /* ignore */ }
  if (!saved || q.get('state') !== saved.state) return false;
  sessionStorage.removeItem('fidelia.dropbox.pkce');
  history.replaceState(null, '', location.pathname);
  const code = q.get('code');
  if (!code) throw new Error(`Dropbox sign-in failed: ${q.get('error_description') ?? q.get('error') ?? 'cancelled'}`);
  writeTok(await tokenRequest({ grant_type: 'authorization_code', code, code_verifier: saved.verifier, redirect_uri: `${location.origin}/` }));
  return true;
}

async function accessToken(): Promise<string> {
  const t = readTok();
  if (!t) throw new AuthExpiredError();
  if (t.expiresAt - 60_000 > Date.now()) return t.access;
  if (!t.refresh) throw new AuthExpiredError();
  const next = await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh });
  writeTok(next);
  return next.access;
}

async function rpc(path: string, arg: unknown): Promise<any> {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(arg),
  });
  if (res.status === 401) throw new AuthExpiredError();
  const text = await res.text();
  if (!res.ok) throw Object.assign(new Error(`Dropbox error ${res.status}: ${text.slice(0, 200)}`), { status: res.status, body: text });
  return text ? JSON.parse(text) : null;
}

async function download(arg: unknown): Promise<{ bytes: Uint8Array; meta: any } | null> {
  const res = await fetch(`${CONTENT}/files/download`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Dropbox-API-Arg': apiArg(arg) },
  });
  if (res.status === 401) throw new AuthExpiredError();
  if (res.status === 409) return null; // not found
  if (!res.ok) throw new Error(`Dropbox error ${res.status}`);
  return { bytes: new Uint8Array(await res.arrayBuffer()), meta: JSON.parse(res.headers.get('Dropbox-API-Result') ?? '{}') };
}

async function upload(path: string, bytes: Uint8Array, mode: unknown): Promise<any> {
  const res = await fetch(`${CONTENT}/files/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      'Content-Type': 'application/octet-stream',
      'Dropbox-API-Arg': apiArg({ path, mode, autorename: false, mute: true }),
    },
    body: bytes as BodyInit,
  });
  if (res.status === 401) throw new AuthExpiredError();
  if (res.status === 409) throw new ConflictError();
  if (!res.ok) throw new Error(`Dropbox error ${res.status}`);
  return res.json();
}

/** An entry in the in-app Dropbox browser. Only folders and church files are returned. */
export interface DropboxEntry { kind: 'folder' | 'file'; name: string; path: string; shared?: boolean }

/** "/a/b" + "c" -> "/a/b/c"; the root is "". */
export const joinPath = (parent: string, name: string) => `${parent === '/' ? '' : parent}/${name}`;
/** "/a/b/c.fidelia" -> "/a/b"; "/c.fidelia" -> "" (the root). */
export const parentOf = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf('/')));
/** Why a folder name can't be used, or null if it's fine. */
export function folderNameProblem(name: string): string | null {
  const n = name.trim();
  if (!n) return 'Type a folder name.';
  if (/[\\/:*?"<>|]/.test(n)) return 'A folder name can’t contain / \\ : * ? " < > |';
  if (n === '.' || n === '..') return 'Choose a different name.';
  if (n.length > 255) return 'That name is too long.';
  return null;
}

/** Folders and *.fidelia files directly inside `path` ("" = top of Dropbox), folders first. */
export async function listDropboxFolder(path: string): Promise<DropboxEntry[]> {
  const out: DropboxEntry[] = [];
  let r = await rpc('/files/list_folder', { path, include_mounted_folders: true, limit: 2000 });
  for (;;) {
    for (const e of r.entries ?? []) {
      if (e['.tag'] === 'folder') out.push({ kind: 'folder', name: e.name, path: e.path_display, shared: !!(e.sharing_info || e.shared_folder_id) });
      else if (e['.tag'] === 'file' && /\.fidelia$/i.test(e.name)) out.push({ kind: 'file', name: e.name, path: e.path_display });
    }
    if (!r.has_more) break;
    r = await rpc('/files/list_folder/continue', { cursor: r.cursor });
  }
  return out.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'folder' ? -1 : 1));
}

/** Creates `name` inside `parent` and returns its path. */
export async function createDropboxFolder(parent: string, name: string): Promise<string> {
  const problem = folderNameProblem(name);
  if (problem) throw new Error(problem);
  try {
    const r = await rpc('/files/create_folder_v2', { path: joinPath(parent, name.trim()), autorename: false });
    return r.metadata.path_display;
  } catch (e) {
    if ((e as { status?: number }).status === 409) throw new Error(`There is already something named “${name.trim()}” here.`);
    throw e;
  }
}

export class DropboxAdapter implements StorageAdapter, LockStore {
  readonly kind = 'dropbox' as const;
  private rev: string | null = null;
  constructor(public path: string) {}

  describe() { return `Dropbox: ${this.path}`; }

  /** Church files (*.fidelia) the user can see, newest first. */
  static async list(): Promise<{ path: string; name: string; modified: string }[]> {
    const r = await rpc('/files/search_v2', { query: '.fidelia', options: { file_extensions: ['fidelia'], max_results: 50 } });
    return (r.matches ?? [])
      .map((m: any) => m.metadata?.metadata)
      .filter((f: any) => f?.['.tag'] === 'file')
      .map((f: any) => ({ path: f.path_display, name: f.name, modified: f.server_modified }))
      .sort((a: any, b: any) => b.modified.localeCompare(a.modified));
  }

  /** True if a file is at this path (false when it was moved, deleted or never shared with this account). */
  async exists(): Promise<boolean> {
    try {
      const m = await rpc('/files/get_metadata', { path: this.path });
      return m?.['.tag'] === 'file';
    } catch (e) {
      if ((e as { status?: number }).status === 409) return false;
      throw e;
    }
  }

  /** The folder holding the church file, e.g. "/Fidelia" (what to share with other treasurers). */
  get folder() { return this.path.slice(0, this.path.lastIndexOf('/')) || '/'; }

  async load(): Promise<Uint8Array | null> {
    const r = await download({ path: this.path });
    if (!r) return null;
    this.rev = r.meta.rev ?? null;
    return r.bytes.length ? r.bytes : null;
  }

  async save(bytes: Uint8Array): Promise<void> {
    const mode = this.rev ? { '.tag': 'update', update: this.rev } : { '.tag': 'add' };
    this.rev = (await upload(this.path, bytes, mode)).rev;
  }

  async listVersions(): Promise<StoredVersion[]> {
    const r = await rpc('/files/list_revisions', { path: this.path, limit: 50 });
    return (r.entries ?? []).slice(1).map((e: any) => ({ id: e.rev, savedAt: e.server_modified, size: e.size }));
  }

  async loadVersion(id: string): Promise<Uint8Array> {
    const r = await download({ path: `rev:${id}` });
    if (!r) throw new Error('Version not found');
    return r.bytes;
  }

  private get lockPath() { return `${this.path}.lock`; }

  async readLock(): Promise<LockInfo | null> {
    const r = await download({ path: this.lockPath });
    if (!r || !r.bytes.length) return null;
    try { return JSON.parse(new TextDecoder().decode(r.bytes)); } catch { return null; }
  }

  async writeLock(l: LockInfo | null): Promise<void> {
    await upload(this.lockPath, new TextEncoder().encode(l ? JSON.stringify(l) : ''), { '.tag': 'overwrite' });
  }

  releaseLockOnExit() {
    const t = readTok();
    if (!t || t.expiresAt < Date.now()) return;
    void fetch(`${CONTENT}/files/upload`, {
      method: 'POST',
      keepalive: true,
      headers: {
        Authorization: `Bearer ${t.access}`,
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': apiArg({ path: this.lockPath, mode: { '.tag': 'overwrite' }, autorename: false, mute: true }),
      },
      body: new Uint8Array(0) as BodyInit,
    }).catch(() => {});
  }
}
