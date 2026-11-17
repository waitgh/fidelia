import { describe, it, expect, beforeEach } from 'vitest';
import { Church } from './church';
import { MemoryAdapter } from '../storage/memory';
import { createDonor, listDonors } from '../data/donors';
import { forgetSession, hasResumableSession, memoryResumeStores, rememberSession, resumeSession, setResumeStores, touchSession, type AdapterFor } from './resume';

Church.lockSettleMs = 0;
const IDLE = 15 * 60_000;

let stores: ReturnType<typeof memoryResumeStores>;
let adapter: MemoryAdapter;
// MemoryAdapter can't be rebuilt from a ref, so pretend it's a Dropbox file and hand the same one back.
const adapterFor: AdapterFor = async () => adapter;
const asDropbox = (c: Church) => { Object.defineProperty(c.adapter, 'kind', { value: 'dropbox' }); (c.adapter as any).path = '/Church/x.fidelia'; return c; };

async function openChurch() {
  adapter = new MemoryAdapter();
  const { church } = await Church.create(adapter, { churchName: 'Grace', username: 'tom', displayName: 'Tom', password: 'password1' });
  return asDropbox(church);
}

beforeEach(async () => {
  stores = memoryResumeStores();
  setResumeStores(stores);
  await forgetSession();
});

describe('stay signed in across a refresh', () => {
  it('reopens the same church as the same member without the password', async () => {
    const church = await openChurch();
    createDonor(church.opened.db, { firstName: 'Amy', lastName: 'Wang' });
    await church.saveNow();
    await rememberSession(church, IDLE);
    church.close(); // the refresh
    expect(hasResumableSession()).toBe(true);
    const again = await resumeSession(adapterFor, Church.resume);
    expect(again?.user).toEqual({ username: 'tom', displayName: 'Tom', role: 'admin' });
    expect(listDonors(again!.opened.db).map((d) => d.lastName)).toEqual(['Wang']);
  });

  it('never stores the data key or plaintext in the tab record', async () => {
    const church = await openChurch();
    await rememberSession(church, IDLE);
    const record = stores.getRecord()!;
    const dk = btoa(String.fromCharCode(...church.dataKeyForResume()));
    expect(record).not.toContain(dk);
    expect(record).not.toContain('Grace');
  });

  it('expires after the idle time, and activity pushes the expiry out', async () => {
    const church = await openChurch();
    const t0 = Date.now();
    await rememberSession(church, IDLE, t0);
    touchSession(IDLE, t0 + 10 * 60_000);
    expect(hasResumableSession(t0 + 20 * 60_000)).toBe(true);
    expect(await resumeSession(adapterFor, Church.resume, t0 + 26 * 60_000)).toBeNull();
    expect(stores.getRecord()).toBeNull();
    expect(await stores.keyIds()).toEqual([]);
  });

  it('signing out deletes both halves', async () => {
    const church = await openChurch();
    await rememberSession(church, IDLE);
    await forgetSession();
    expect(stores.getRecord()).toBeNull();
    expect(await stores.keyIds()).toEqual([]);
    expect(await resumeSession(adapterFor, Church.resume)).toBeNull();
  });

  it('does not work with only the tab record (key missing, e.g. another browser)', async () => {
    const church = await openChurch();
    await rememberSession(church, IDLE);
    for (const id of await stores.keyIds()) await stores.setKey(id, null);
    expect(await resumeSession(adapterFor, Church.resume)).toBeNull();
  });

  it('refuses a tampered record', async () => {
    const church = await openChurch();
    await church.setMember({ username: 'vi', displayName: 'Vi', role: 'viewer' }, 'viewerpass');
    await church.saveNow();
    await rememberSession(church, IDLE);
    stores.setRecord(stores.getRecord()!.replace('"username":"tom"', '"username":"vi"'));
    expect(await resumeSession(adapterFor, Church.resume)).toBeNull();
  });

  it('refuses a member who was removed since', async () => {
    const church = await openChurch();
    await church.setMember({ username: 'bo', displayName: 'Bo', role: 'bookkeeper' }, 'bookpass1');
    await church.saveNow();
    const bo = asDropbox(await Church.unlock(adapter, 'bo', 'bookpass1'));
    await rememberSession(bo, IDLE);
    bo.close();
    await church.removeMember('bo');
    await church.saveNow();
    expect(await resumeSession(adapterFor, Church.resume)).toBeNull();
  });

  it('sweeps keys left behind by tabs closed without signing out', async () => {
    const church = await openChurch();
    const t0 = Date.now();
    await rememberSession(church, IDLE, t0);
    stores.setRecord(null); // tab closed: its sessionStorage half is gone, the key stays
    await rememberSession(church, IDLE, t0 + 60_000);
    expect(await stores.keyIds()).toHaveLength(2); // the old one is less than a day old
    stores.setRecord(null);
    await rememberSession(church, IDLE, t0 + 25 * 3600_000);
    await new Promise((r) => setTimeout(r, 10));
    expect(await stores.keyIds()).toHaveLength(1);
  });

  it('is not used for the demo', async () => {
    adapter = new MemoryAdapter();
    const { church } = await Church.create(adapter, { churchName: '', username: 'demo', displayName: 'Demo', password: 'demo-password' });
    await rememberSession(church, IDLE);
    expect(hasResumableSession()).toBe(false);
  });
});
