import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DropboxAdapter, joinPath, parentOf, folderNameProblem, listDropboxFolder, createDropboxFolder } from './dropbox';
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
    if (url.endsWith('/files/list_folder') || url.endsWith('/files/list_folder/continue')) {
      const page2 = url.endsWith('/continue');
      return new Response(JSON.stringify(page2
        ? { entries: [{ '.tag': 'file', name: 'Grace.fidelia', path_display: '/Grace.fidelia' }], has_more: false }
        : { entries: [{ '.tag': 'file', name: 'notes.txt', path_display: '/notes.txt' }, { '.tag': 'folder', name: 'Zion', path_display: '/Zion', sharing_info: {} }, { '.tag': 'folder', name: 'Archive', path_display: '/Archive' }], has_more: true, cursor: 'c' }));
    }
    if (url.endsWith('/files/create_folder_v2')) {
      const { path } = JSON.parse(init.body as string);
      if (path === '/Taken') return new Response('{"error_summary":"path/conflict/folder/"}', { status: 409 });
      return new Response(JSON.stringify({ metadata: { path_display: path } }));
    }
    if (url.endsWith('/files/get_metadata')) {
      const { path } = JSON.parse(init.body as string);
      return files.has(path) ? new Response(JSON.stringify({ '.tag': 'file' })) : new Response('{"error_summary":"path/not_found/"}', { status: 409 });
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
  it('tells whether the church file is still at its path', async () => {
    const a = new DropboxAdapter('/Fidelia/Church.fidelia');
    expect(a.folder).toBe('/Fidelia');
    expect(new DropboxAdapter('/top.fidelia').folder).toBe('/');
    expect(await a.exists()).toBe(false);
    await a.save(new Uint8Array([1]));
    expect(await a.exists()).toBe(true);
  });
  it('joins and splits paths, with "" as the top of Dropbox', () => {
    expect(joinPath('', 'Fidelia')).toBe('/Fidelia');
    expect(joinPath('/Fidelia', 'Church.fidelia')).toBe('/Fidelia/Church.fidelia');
    expect(parentOf('/Fidelia/Church.fidelia')).toBe('/Fidelia');
    expect(parentOf('/Church.fidelia')).toBe('');
    expect(folderNameProblem('  ')).toMatch(/Type/);
    expect(folderNameProblem('a/b')).toMatch(/can’t contain/);
    expect(folderNameProblem('Fidelia 2026')).toBeNull();
  });
  it('lists folders first, then church files only, across pages', async () => {
    const list = await listDropboxFolder('');
    expect(list.map((e) => [e.kind, e.name, !!e.shared])).toEqual([['folder', 'Archive', false], ['folder', 'Zion', true], ['file', 'Grace.fidelia', false]]);
  });
  it('creates folders and explains name clashes', async () => {
    expect(await createDropboxFolder('/Church', ' Books ')).toBe('/Church/Books');
    await expect(createDropboxFolder('', 'Taken')).rejects.toThrow('already something named');
    await expect(createDropboxFolder('', '')).rejects.toThrow('Type a folder name');
  });
});
