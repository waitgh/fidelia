// Keeps this tab signed in across a page refresh, for as long as the idle sign-out allows.
//
// The church data key is encrypted with a random, non-extractable AES key that lives in
// IndexedDB. The encrypted data key, the expiry and where the church file is kept live in this
// tab's sessionStorage. Neither half opens anything on its own. Closing the tab drops the
// sessionStorage half; signing out (including the idle sign-out) deletes both. Nothing here
// ever leaves the device.
import type { Church } from './church';
import type { StorageAdapter } from '../storage/types';

/** sessionStorage key for this tab's half. */
export const SESSION_RECORD_KEY = 'fidelia.session';
const KEY_PREFIX = 'session-key:';
/** Keys from tabs that were closed without signing out are swept after this long. */
const STALE_KEY_MS = 24 * 60 * 60 * 1000;
/** Don't rewrite the expiry on every mouse move. */
const TOUCH_EVERY_MS = 30_000;

type Kind = 'dropbox' | 'google-drive' | 'local-file';

interface SessionRecord {
  v: 1;
  id: string;
  churchId: string;
  username: string;
  kind: Kind;
  /** Dropbox path or Drive file id (local files keep their handle in the key entry). */
  ref?: string;
  /** Drive file name, for display. */
  name?: string;
  iv: string;
  wrapped: string;
  expiresAt: number;
}

interface KeyEntry {
  key: CryptoKey;
  /** FileSystemFileHandle for local files (structured-cloneable, not storable in sessionStorage). */
  handle?: unknown;
  createdAt: number;
}

export interface ResumeStores {
  getRecord(): string | null;
  setRecord(v: string | null): void;
  getKey(id: string): Promise<KeyEntry | null>;
  setKey(id: string, e: KeyEntry | null): Promise<void>;
  keyIds(): Promise<string[]>;
}

/** In-memory stores for tests; the app installs browser-backed ones at startup. */
export function memoryResumeStores(): ResumeStores {
  let record: string | null = null;
  const keys = new Map<string, KeyEntry>();
  return {
    getRecord: () => record,
    setRecord: (v) => { record = v; },
    getKey: async (id) => keys.get(id) ?? null,
    setKey: async (id, e) => { if (e) keys.set(id, e); else keys.delete(id); },
    keyIds: async () => [...keys.keys()],
  };
}
let stores: ResumeStores = memoryResumeStores();
export const setResumeStores = (s: ResumeStores) => { stores = s; };

const enc = new TextEncoder();
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const aad = (r: Pick<SessionRecord, 'id' | 'churchId' | 'username'>) => enc.encode(`fidelia:resume:v1:${r.churchId}:${r.username}:${r.id}`);

function readRecord(): SessionRecord | null {
  try {
    const r = JSON.parse(stores.getRecord() ?? 'null') as SessionRecord | null;
    return r?.v === 1 ? r : null;
  } catch { return null; }
}
const writeRecord = (r: SessionRecord | null) => { try { stores.setRecord(r ? JSON.stringify(r) : null); } catch { /* storage blocked */ } };

/** True if this tab may be able to resume (used to show a spinner instead of the sign-in page). */
export const hasResumableSession = (now = Date.now()) => (readRecord()?.expiresAt ?? 0) > now;

async function sweepStaleKeys(keep: string | undefined, now: number) {
  for (const k of await stores.keyIds()) {
    if (!k.startsWith(KEY_PREFIX) || k === KEY_PREFIX + keep) continue;
    const e = await stores.getKey(k);
    if (!e || now - e.createdAt > STALE_KEY_MS) await stores.setKey(k, null);
  }
}

/** Remembers the open church for this tab. Does nothing for the demo or before a member is chosen. */
export async function rememberSession(church: Church, idleMs: number, now = Date.now()): Promise<void> {
  const a = church.adapter as StorageAdapter & { path?: string; fileId?: string; name?: string; fileHandle?: unknown };
  if (!church.user || a.kind === 'memory') return;
  await forgetSession();
  const id = b64(globalThis.crypto.getRandomValues(new Uint8Array(12))).replace(/[^A-Za-z0-9]/g, '');
  const base = { id, churchId: church.churchId, username: church.user.username };
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const dk = church.dataKeyForResume();
  const wrapped = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(base) }, key, dk as BufferSource));
  dk.fill(0);
  await stores.setKey(KEY_PREFIX + id, { key, handle: a.kind === 'local-file' ? a.fileHandle : undefined, createdAt: now });
  writeRecord({
    v: 1, ...base, kind: a.kind,
    ref: a.kind === 'dropbox' ? a.path : a.kind === 'google-drive' ? a.fileId : undefined,
    name: a.kind === 'google-drive' ? a.name : undefined,
    iv: b64(iv), wrapped: b64(wrapped), expiresAt: now + idleMs,
  });
  void sweepStaleKeys(id, now).catch(() => {});
}

let lastTouch = 0;
/** Pushes the expiry out after activity (sliding, like the idle sign-out). */
export function touchSession(idleMs: number, now = Date.now()) {
  if (now - lastTouch < TOUCH_EVERY_MS) return;
  const r = readRecord();
  if (!r) return;
  lastTouch = now;
  writeRecord({ ...r, expiresAt: now + idleMs });
}

/** Signs this tab out for good: deletes both halves. */
export async function forgetSession(): Promise<void> {
  const r = readRecord();
  writeRecord(null);
  lastTouch = 0;
  if (r) await stores.setKey(KEY_PREFIX + r.id, null).catch(() => {});
}

export type AdapterFor = (r: { kind: Kind; ref?: string; name?: string; handle?: unknown }) => Promise<StorageAdapter | null>;
export type OpenChurch = (adapter: StorageAdapter, dataKey: Uint8Array, username: string) => Promise<Church>;

/**
 * Re-opens the church this tab had open, or returns null (then the sign-in page shows).
 * An expired, tampered or no-longer-valid session is deleted.
 */
export async function resumeSession(adapterFor: AdapterFor, open: OpenChurch, now = Date.now()): Promise<Church | null> {
  const r = readRecord();
  if (!r) return null;
  const entry = await stores.getKey(KEY_PREFIX + r.id).catch(() => null);
  if (r.expiresAt <= now || !entry) { await forgetSession(); return null; }
  // Can't reach the file without a cloud sign-in or file permission: let the sign-in page handle it.
  const adapter = await adapterFor({ kind: r.kind, ref: r.ref, name: r.name, handle: entry.handle }).catch(() => null);
  if (!adapter) { await forgetSession(); return null; }
  let dk: Uint8Array;
  try {
    dk = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(r.iv) as BufferSource, additionalData: aad(r) }, entry.key, unb64(r.wrapped) as BufferSource));
  } catch { await forgetSession(); return null; }
  try {
    const church = await open(adapter, dk, r.username);
    if (church.churchId !== r.churchId) { church.close(); await forgetSession(); return null; }
    return church;
  } catch {
    await forgetSession();
    return null;
  } finally {
    dk.fill(0);
  }
}
