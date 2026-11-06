import { describe, it, expect } from 'vitest';
import { Church } from './church';
import { MemoryAdapter } from '../storage/memory';
import { createDonor, listDonors } from '../data/donors';
import { getAllSettings } from '../data/settings';
import { readHeader } from '../crypto/envelope';

const setup = () => Church.create(new MemoryAdapter(), { churchName: 'Grace', username: 'tom', displayName: 'Tom', password: 'password1' });

describe('Church session', () => {
  it('creates, saves encrypted, and unlocks with password', async () => {
    const { church } = await setup();
    createDonor(church.opened.db, { firstName: 'Amy', lastName: 'Wang' });
    await church.saveNow();
    const file = (await church.adapter.load())!;
    expect(new TextDecoder().decode(file)).not.toContain('Wang');
    readHeader(file);
    const again = await Church.unlock(church.adapter, 'Tom', 'password1');
    expect(again.user).toEqual({ username: 'tom', displayName: 'Tom', role: 'admin' });
    expect(listDonors(again.opened.db).map((d) => d.lastName)).toEqual(['Wang']);
    expect(getAllSettings(again.opened.db).churchName).toBe('Grace');
    await expect(Church.unlock(church.adapter, 'tom', 'wrong')).rejects.toThrow('Wrong');
  });

  it('refuses to create over an existing file', async () => {
    const { church } = await setup();
    await expect(Church.create(church.adapter, { churchName: '', username: 'x', displayName: '', password: 'password1' })).rejects.toThrow('already exists');
  });

  it('manages members and recovery', async () => {
    const { church, recoveryKey } = await setup();
    await church.setMember({ username: 'vi', displayName: 'Vi', role: 'viewer' }, 'viewerpass');
    const vi = await Church.unlock(church.adapter, 'vi', 'viewerpass');
    expect(vi.readOnly).toBe(true);
    expect(church.listMembers().map((m) => [m.username, m.hasPassword])).toEqual([['tom', true], ['vi', true]]);
    await church.removeMember('vi');
    await expect(Church.unlock(church.adapter, 'vi', 'viewerpass')).rejects.toThrow();
    await expect(church.setMember({ username: 'x', displayName: '', role: 'viewer' }, 'short')).rejects.toThrow('8');

    const rec = await Church.unlockWithRecoveryKey(church.adapter, recoveryKey);
    expect(rec.user).toBeNull();
    await rec.claimAsAdmin('tom', 'Tom', 'brandnewpw');
    await Church.unlock(church.adapter, 'tom', 'brandnewpw');
    await expect(Church.unlock(church.adapter, 'tom', 'password1')).rejects.toThrow();
  });

  it('debounces autosave and restores previous versions', async () => {
    const { church } = await setup();
    church.saveDelayMs = 10;
    const states: string[] = [];
    church.onState((s) => states.push(s));
    createDonor(church.opened.db, { firstName: 'A', lastName: 'One' });
    church.markDirty();
    createDonor(church.opened.db, { firstName: 'B', lastName: 'Two' });
    church.markDirty();
    expect(church.hasUnsavedChanges).toBe(true);
    await new Promise((r) => setTimeout(r, 50));
    expect(states).toEqual(['dirty', 'dirty', 'saving', 'saved']);
    const versions = await church.adapter.listVersions();
    expect(versions).toHaveLength(2); // create + autosave
    await church.restoreVersion(versions[1]!.id);
    expect(listDonors(church.opened.db)).toHaveLength(0);
  });
});

describe('pending saves', () => {
  it('parks the encrypted file when sign-in expires and uploads it on next unlock', async () => {
    const { AuthExpiredError } = await import('../storage/googleDrive');
    const { church } = await setup();
    const adapter = church.adapter as MemoryAdapter;
    const realSave = adapter.save.bind(adapter);
    adapter.save = async () => { throw new AuthExpiredError(); };
    createDonor(church.opened.db, { firstName: 'Late', lastName: 'Edit' });
    await expect(church.saveNow()).rejects.toThrow(AuthExpiredError);
    adapter.save = realSave;
    const again = await Church.unlock(adapter, 'tom', 'password1');
    expect(listDonors(again.opened.db).map((d) => d.lastName)).toEqual(['Edit']);
    const reopened = await Church.unlock(new MemoryAdapter(), 'tom', 'password1').catch(() => null);
    expect(reopened).toBeNull();
    // uploaded: a fresh unlock straight from storage sees it too
    const { pendingStore } = await import('./church');
    expect(await pendingStore.get(again.churchId)).toBeNull();
  });
});

describe('import from old app', () => {
  it('creates an encrypted church from a plain old database, keeping data and users', async () => {
    const { openDatabase } = await import('../data/db');
    const { users } = await import('../../db/schema');
    const old = await openDatabase();
    createDonor(old.db, { firstName: 'Old', lastName: 'Donor' });
    old.db.insert(users).values({ username: 'treasurer', displayName: 'T', passwordHash: '$2b$bcrypt', role: 'admin' }).run();
    old.db.insert(users).values({ username: 'viewer1', displayName: 'V', passwordHash: '$2b$bcrypt', role: 'viewer' }).run();
    const bytes = old.raw.export();
    const { church } = await Church.create(new MemoryAdapter(), { churchName: '', username: 'treasurer', displayName: 'Tre', password: 'password1', importBytes: bytes });
    expect(listDonors(church.opened.db).map((d) => d.lastName)).toEqual(['Donor']);
    expect(church.listMembers().map((m) => [m.username, m.role, m.hasPassword])).toEqual([['treasurer', 'admin', true], ['viewer1', 'viewer', false]]);
    await Church.unlock(church.adapter, 'treasurer', 'password1');
    await expect(Church.create(new MemoryAdapter(), { churchName: '', username: 'x', displayName: '', password: 'password1', importBytes: new Uint8Array(100) })).rejects.toThrow('encrypted');
  });
});
