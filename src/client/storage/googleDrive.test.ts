import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoogleDriveAdapter, AuthExpiredError, ConflictError } from './googleDrive';

let version = '1';
let content = new Uint8Array();
const calls: string[] = [];

beforeEach(() => {
  version = '1'; content = new Uint8Array(); calls.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push(`${init.method ?? 'GET'} ${url}`);
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
    if (url.includes('fields=headRevisionId,size,name')) return json({ headRevisionId: version, size: String(content.length), name: 'c.fidelia' });
    if (url.includes('alt=media') && !url.includes('revisions')) return new Response(content as BodyInit);
    if (url.includes('uploadType=media')) { content = new Uint8Array(init.body as Uint8Array); version = String(Number(version) + 1); return json({ headRevisionId: version }); }
    if (url.endsWith('/revisions?fields=revisions(id,modifiedTime,size)&pageSize=200')) return json({ revisions: [{ id: 'a', modifiedTime: 't1', size: '3' }, { id: 'b', modifiedTime: 't2', size: '4' }] });
    if (url.includes('/files?q=')) return json({ files: [{ id: 'a', name: 'Church.fidelia', modifiedTime: 't', size: '900' }, { id: 'b', name: 'Church.fidelia', modifiedTime: 't', size: '0' }] });
    return new Response('{}', { status: 404 });
  }));
});

describe('GoogleDriveAdapter', () => {
  it('loads empty, saves, and reloads', async () => {
    const a = new GoogleDriveAdapter('F', 'c.fidelia', () => 'tok');
    expect(await a.load()).toBeNull();
    await a.save(new Uint8Array([1, 2, 3]));
    expect(await a.load()).toEqual(new Uint8Array([1, 2, 3]));
    expect(calls.some((c) => c.startsWith('PATCH'))).toBe(true);
  });
  it('detects a concurrent writer', async () => {
    const a = new GoogleDriveAdapter('F', 'c', () => 'tok');
    await a.load();
    version = '7';
    await expect(a.save(new Uint8Array([1]))).rejects.toThrow(ConflictError);
  });
  it('fails clearly without a token', async () => {
    await expect(new GoogleDriveAdapter('F', 'c', () => null).load()).rejects.toThrow(AuthExpiredError);
  });
  it('lists previous versions newest first, excluding current', async () => {
    const v = await new GoogleDriveAdapter('F', 'c', () => 'tok').listVersions();
    expect(v).toEqual([{ id: 'a', savedAt: 't1', size: 3 }]);
  });
  it('lists only non-empty church files', async () => {
    expect(await GoogleDriveAdapter.list(() => 'tok')).toEqual([{ id: 'a', name: 'Church.fidelia', modifiedTime: 't' }]);
  });
});
