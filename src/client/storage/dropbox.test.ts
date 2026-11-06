import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DropboxAdapter } from './dropbox';
import { ConflictError } from './googleDrive';

const files = new Map<string, { bytes: Uint8Array; rev: string }>();
let revN = 0;

beforeEach(() => {
  files.clear();
  const store = new Map<string, string>([['fidelia.dropbox.token', JSON.stringify({ access: 't', expiresAt: Date.now() + 1e7 })]]);
  vi.stubGlobal('sessionStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) });
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    const arg = JSON.parse((init.headers as Record<string, string>)['Dropbox-API-Arg'] ?? 'null');
    if (url.endsWith('/files/download')) {
      const f = files.get(arg.path);
      return f ? new Response(f.bytes as BodyInit, { headers: { 'Dropbox-API-Result': JSON.stringify({ rev: f.rev }) } }) : new Response('{}', { status: 409 });
    }
    if (url.endsWith('/files/upload')) {
      const cur = files.get(arg.path);
      if (arg.mode['.tag'] === 'update' && cur?.rev !== arg.mode.update) return new Response('{}', { status: 409 });
      if (arg.mode['.tag'] === 'add' && cur) return new Response('{}', { status: 409 });
      const rev = `r${++revN}`;
      files.set(arg.path, { bytes: new Uint8Array(init.body as Uint8Array), rev });
      return new Response(JSON.stringify({ rev }));
    }
    return new Response('{}', { status: 404 });
  }));
});

describe('DropboxAdapter', () => {
  it('saves, reloads and detects conflicting writers', async () => {
    const a = new DropboxAdapter('/Church/grace.fidelia');
    expect(await a.load()).toBeNull();
    await a.save(new Uint8Array([1]));
    const b = new DropboxAdapter('/Church/grace.fidelia');
    expect(await b.load()).toEqual(new Uint8Array([1]));
    await b.save(new Uint8Array([2]));
    await expect(a.save(new Uint8Array([3]))).rejects.toThrow(ConflictError);
  });
  it('stores the edit lock in a sibling file', async () => {
    const a = new DropboxAdapter('/c.fidelia');
    expect(await a.readLock()).toBeNull();
    await a.writeLock({ owner: 'Zoë', token: 'x', expiresAt: 5 });
    expect(await a.readLock()).toEqual({ owner: 'Zoë', token: 'x', expiresAt: 5 });
    await a.writeLock(null);
    expect(await a.readLock()).toBeNull();
  });
});
