// One editor at a time. The lock is a small record next to the church file with a
// heartbeat and expiry; others open read-only. Acquire = write, wait, re-read: if our
// token survived, we hold it. The save-time revision check is the backstop for races.
import type { LockInfo, LockStore } from '../storage/types';

export const LOCK_TTL_MS = 3 * 60_000;
export const HEARTBEAT_MS = 60_000;
const SETTLE_MS = 1500;

export type AcquireResult = { ok: true; lock: LockInfo } | { ok: false; holder: LockInfo };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function acquireLock(
  store: LockStore,
  owner: string,
  opts: { now?: () => number; settleMs?: number; token?: string; user?: string; force?: boolean } = {},
): Promise<AcquireResult> {
  const now = opts.now ?? Date.now;
  const current = await store.readLock();
  // force: take over a live lock (only offered when it is the same member's other window).
  if (!opts.force && current && current.expiresAt > now() && current.token !== opts.token) return { ok: false, holder: current };
  const lock: LockInfo = { owner, ...(opts.user ? { user: opts.user } : {}), token: opts.token ?? crypto.randomUUID(), expiresAt: now() + LOCK_TTL_MS };
  await store.writeLock(lock);
  await sleep(opts.settleMs ?? SETTLE_MS);
  const after = await store.readLock();
  if (after?.token !== lock.token) return { ok: false, holder: after ?? lock };
  return { ok: true, lock };
}

/** Extends our lock. Returns false if someone else holds it now (we lost it). */
export async function renewLock(store: LockStore, lock: LockInfo, now = Date.now()): Promise<LockInfo | null> {
  const current = await store.readLock();
  if (current && current.token !== lock.token && current.expiresAt > now) return null;
  const next = { ...lock, expiresAt: now + LOCK_TTL_MS };
  await store.writeLock(next);
  return next;
}

export async function releaseLock(store: LockStore, lock: LockInfo) {
  const current = await store.readLock();
  if (current?.token === lock.token) await store.writeLock(null);
}
