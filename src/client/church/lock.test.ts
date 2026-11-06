import { describe, it, expect } from 'vitest';
import { acquireLock, renewLock, releaseLock, LOCK_TTL_MS } from './lock';
import type { LockInfo, LockStore } from '../storage/types';

const store = (): LockStore & { v: LockInfo | null } => {
  const s = { v: null as LockInfo | null, async readLock() { return s.v; }, async writeLock(l: LockInfo | null) { s.v = l; } };
  return s;
};

describe('edit lock', () => {
  it('lets one editor in and keeps others out until expiry', async () => {
    const s = store();
    let t = 1000;
    const a = await acquireLock(s, 'Ann', { now: () => t, settleMs: 0 });
    expect(a.ok).toBe(true);
    const b = await acquireLock(s, 'Bob', { now: () => t, settleMs: 0 });
    expect(b).toMatchObject({ ok: false, holder: { owner: 'Ann' } });
    t += LOCK_TTL_MS + 1;
    expect((await acquireLock(s, 'Bob', { now: () => t, settleMs: 0 })).ok).toBe(true);
  });
  it('detects a lost lock on renew and only releases its own', async () => {
    const s = store();
    const a = await acquireLock(s, 'Ann', { settleMs: 0 });
    if (!a.ok) throw new Error();
    s.v = { owner: 'Bob', token: 'b', expiresAt: Date.now() + LOCK_TTL_MS };
    expect(await renewLock(s, a.lock)).toBeNull();
    await releaseLock(s, a.lock);
    expect(s.v?.owner).toBe('Bob');
  });
  it('loses a write race', async () => {
    const s = store();
    const orig = s.writeLock.bind(s);
    s.writeLock = async (l) => { await orig(l); if (l?.owner === 'Ann') s.v = { owner: 'Bob', token: 'b', expiresAt: Date.now() + 1e6 }; };
    expect(await acquireLock(s, 'Ann', { settleMs: 0 })).toMatchObject({ ok: false, holder: { owner: 'Bob' } });
  });
});
