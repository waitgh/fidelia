// A church session: an unlocked, decrypted database plus where it is stored.
// Saving = integrity check → export → encrypt → upload. Plaintext never leaves the browser.
import { eq } from 'drizzle-orm';
import { users } from '../../db/schema';
import { openDatabase, exportDatabase, type OpenedDb } from '../data/db';
import { updateSetting } from '../data/settings';
import { writeAudit } from '../data/auditLog';
import { hasLockStore, type LockInfo, type StorageAdapter } from '../storage/types';
import { acquireLock, renewLock, releaseLock, HEARTBEAT_MS } from './lock';
import * as E from '../crypto/envelope';
import { AuthExpiredError } from '../storage/googleDrive';

/** Where a not-yet-uploaded encrypted save is parked. Injected so tests can run without IndexedDB. */
export interface PendingStore {
  get(churchId: string): Promise<{ file: Uint8Array; savedAt: string } | null>;
  set(churchId: string, p: { file: Uint8Array; savedAt: string } | null): Promise<void>;
}
const memoryPending = new Map<string, { file: Uint8Array; savedAt: string }>();
export let pendingStore: PendingStore = {
  get: async (id) => memoryPending.get(id) ?? null,
  set: async (id, p) => { if (p) memoryPending.set(id, p); else memoryPending.delete(id); },
};
export const setPendingStore = (s: PendingStore) => { pendingStore = s; };

export type Role = 'admin' | 'bookkeeper' | 'viewer';
export interface Member {
  username: string;
  displayName: string;
  role: Role;
}

/** Opens a plain SQLite file from the old app (or a new empty database). */
async function openPlainImport(bytes?: Uint8Array): Promise<OpenedDb> {
  if (!bytes) return openDatabase();
  const head = new TextDecoder().decode(bytes.subarray(0, 15));
  if (head !== 'SQLite format 3') {
    throw new Error('This file is still encrypted or is not a database. Export a plain copy with scripts/export-old-db.mjs first.');
  }
  const opened = await openDatabase(bytes);
  if (opened.readOnly) throw new Error('This database is from a newer app version.');
  for (const t of ['donors', 'offerings', 'batches', 'categories']) {
    if (!opened.raw.exec(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='${t}'`).length) {
      throw new Error('This does not look like a Fidelia Ledger database.');
    }
  }
  return opened;
}

export type SaveState = 'saved' | 'dirty' | 'saving' | 'error';

export class Church {
  private dirty = false;
  private saving: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<(s: SaveState, err?: unknown) => void>();
  state: SaveState = 'saved';
  /** Set when someone else holds the edit lock: this session is read-only. */
  lockedBy: LockInfo | null = null;
  private lock: LockInfo | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  /** Lock settle delay; tests set 0. */
  static lockSettleMs = 1500;
  lastError: unknown = null;

  private constructor(
    public adapter: StorageAdapter,
    private unlocked: E.Unlocked,
    public opened: OpenedDb,
    /** null when unlocked with the recovery key and no user picked yet. */
    public user: Member | null,
    public saveDelayMs = 1500,
  ) {}

  get churchId() { return this.unlocked.header.churchId; }
  get readOnly() { return this.opened.readOnly || this.user?.role === 'viewer' || this.lockedBy !== null; }

  /** Tries to become the editor. Safe to call again (e.g. "Try again" button). */
  async takeLock(): Promise<boolean> {
    if (!hasLockStore(this.adapter) || this.opened.readOnly || this.user?.role === 'viewer') return true;
    const store = this.adapter;
    const r = await acquireLock(store, this.user?.displayName ?? 'Someone', { settleMs: Church.lockSettleMs, token: this.lock?.token });
    if (!r.ok) {
      this.lockedBy = r.holder;
      this.setState(this.state);
      return false;
    }
    this.lock = r.lock;
    const wasLockedOut = this.lockedBy !== null;
    this.lockedBy = null;
    if (wasLockedOut) {
      // The other editor may have saved since we opened: start from the latest file.
      const file = await this.adapter.load();
      if (file) {
        const fresh = await openDatabase(await E.decryptFile(this.unlocked, file));
        this.opened.raw.close();
        this.opened = fresh;
      }
    }
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = setInterval(() => {
      if (!this.lock) return;
      renewLock(store, this.lock).then((next) => {
        if (next) { this.lock = next; return; }
        this.lock = null;
        void store.readLock().then((h) => { this.lockedBy = h; this.setState(this.state); });
      }).catch(() => { /* offline: keep trying; the lock may expire */ });
    }, HEARTBEAT_MS);
    this.setState(this.state);
    return true;
  }

  static async create(
    adapter: StorageAdapter,
    p: { churchName: string; username: string; displayName: string; password: string; importBytes?: Uint8Array },
  ): Promise<{ church: Church; recoveryKey: string }> {
    if ((await adapter.load()) !== null) throw new Error('A church file already exists here');
    const opened = await openPlainImport(p.importBytes);
    const { unlocked, recoveryKey } = await E.createChurchKeys(p.username, p.password);
    const member: Member = { username: p.username.trim(), displayName: p.displayName.trim() || p.username.trim(), role: 'admin' };
    const hint = await E.usernameHint(unlocked.header.churchId, member.username);
    // Imported users keep their names and roles but have no password until an admin sets one.
    opened.db.update(users).set({ passwordHash: '' }).run();
    const existing = opened.db.select().from(users).where(eq(users.username, member.username)).get();
    if (existing) opened.db.update(users).set({ ...member, isActive: true, passwordHash: hint }).where(eq(users.id, existing.id)).run();
    else opened.db.insert(users).values({ ...member, passwordHash: hint }).run();
    if (p.churchName) updateSetting(opened.db, 'churchName', p.churchName);
    const church = new Church(adapter, unlocked, opened, member);
    await church.saveNow();
    await church.takeLock().catch(() => {});
    return { church, recoveryKey };
  }

  /** Loads the stored file, preferring a parked (not yet uploaded) save of the same church. */
  private static async loadFile(adapter: StorageAdapter) {
    const file = await adapter.load();
    if (!file) throw new Error('No church file found at this location');
    const pending = await pendingStore.get(E.readHeader(file).churchId);
    return pending ? pending.file : file;
  }

  /** Uploads a parked save of this church, if there is one. */
  private async uploadPendingIfAny() {
    if (await pendingStore.get(this.churchId)) await this.saveNow();
  }

  static async unlock(adapter: StorageAdapter, username: string, password: string): Promise<Church> {
    const file = await Church.loadFile(adapter);
    const unlocked = await E.unlockWithPassword(E.readHeader(file), username, password);
    const opened = await openDatabase(await E.decryptFile(unlocked, file));
    const row = opened.db.select().from(users).where(eq(users.username, username.trim())).get()
      ?? opened.db.select().from(users).all().find((u) => u.username.toLowerCase() === username.trim().toLowerCase());
    if (!row || !row.isActive) {
      opened.raw.close();
      throw new E.WrongPasswordError();
    }
    const church = new Church(adapter, unlocked, opened, { username: row.username, displayName: row.displayName, role: row.role as Role });
    await church.takeLock().catch(() => {});
    if (!church.readOnly) await church.uploadPendingIfAny().catch(() => {});
    return church;
  }

  static async unlockWithRecoveryKey(adapter: StorageAdapter, recoveryKey: string): Promise<Church> {
    const file = await Church.loadFile(adapter);
    const unlocked = await E.unlockWithRecoveryKey(E.readHeader(file), recoveryKey);
    const opened = await openDatabase(await E.decryptFile(unlocked, file));
    return new Church(adapter, unlocked, opened, null); // takes the lock in claimAsAdmin
  }

  /** Set after unlocking with an invite code, until `acceptInvite`. */
  private invite: E.KeySlot | null = null;

  /** Opens the church with an invite code; then call `acceptInvite` with the new member's details. */
  static async unlockWithInvite(adapter: StorageAdapter, code: string): Promise<Church> {
    const file = await Church.loadFile(adapter);
    const { unlocked, slot } = await E.unlockWithInvite(E.readHeader(file), code);
    const opened = await openDatabase(await E.decryptFile(unlocked, file));
    const church = new Church(adapter, unlocked, opened, null);
    church.invite = slot;
    return church;
  }

  get inviteRole(): Role | null { return (this.invite?.role as Role) ?? null; }

  /** Joins with the invite: adds the member with the invite's role and uses up the invite. */
  async acceptInvite(username: string, displayName: string, password: string) {
    const slot = this.invite;
    if (!slot) throw new Error('No invite');
    const name = username.trim();
    if (!name || /\s/.test(name)) throw new Error('Choose a sign-in name without spaces');
    const taken = this.opened.db.select().from(users).all()
      .some((u) => u.isActive && u.username.toLowerCase() === name.toLowerCase());
    if (taken) throw new Error('That sign-in name is already used. Choose another.');
    const m: Member = { username: name, displayName: displayName.trim() || name, role: (slot.role as Role) ?? 'viewer' };
    this.user = m;
    await this.takeLock().catch(() => {});
    if (this.lockedBy) { this.user = null; throw new Error(`${this.lockedBy.owner} is using the church right now. Ask them to sign out, then try again.`); }
    this.unlocked = { ...this.unlocked, header: E.removeSlot(this.unlocked, slot.id) };
    this.invite = null;
    this.audit('accept_invite', `${name} (${m.role})`);
    await this.setMember(m, password);
  }

  /** Admin: creates a one-time invite code for a new member with this role. */
  async createInvite(role: Role): Promise<string> {
    const { header, code } = await E.createInvite(this.unlocked, role);
    this.unlocked = { ...this.unlocked, header };
    this.audit('invite_member', role);
    await this.saveNow();
    return code;
  }

  listInvites(now = Date.now()): { id: string; role: Role; expires: number; expired: boolean }[] {
    return this.unlocked.header.keyslots.filter((s) => s.kind === 'invite')
      .map((s) => ({ id: s.id, role: s.role as Role, expires: s.expires ?? 0, expired: (s.expires ?? 0) < now }));
  }

  async revokeInvite(id: string) {
    this.unlocked = { ...this.unlocked, header: E.removeSlot(this.unlocked, id) };
    this.audit('revoke_invite');
    await this.saveNow();
  }

  private audit(action: string, detail?: string) {
    writeAudit(this.opened.db, { username: this.user?.displayName ?? 'recovery key', action, resource: 'member', detail });
  }

  // ---------- members ----------
  listMembers(): (Member & { isActive: boolean; hasPassword: boolean })[] {
    const slots = new Set(this.unlocked.header.keyslots.map((s) => s.hint));
    return this.opened.db.select().from(users).orderBy(users.displayName).all().map((u) => ({
      username: u.username,
      displayName: u.displayName,
      role: u.role as Role,
      isActive: u.isActive,
      hasPassword: slots.has(u.passwordHash), // passwordHash column holds the slot hint
    }));
  }

  /** Adds a member or resets their password. Admin only (enforced in UI). */
  async setMember(m: Member, password: string) {
    const username = m.username.trim();
    if (!username) throw new Error('Sign-in name is required');
    if (password.length < 8) throw new Error('Password must be at least 8 characters');
    const header = await E.setUserPassword(this.unlocked, username, password);
    const hint = await E.usernameHint(this.churchId, username);
    const existing = this.opened.db.select().from(users).where(eq(users.username, username)).get();
    if (existing) {
      this.opened.db.update(users)
        .set({ displayName: m.displayName, role: m.role, isActive: true, passwordHash: hint, updatedAt: new Date().toISOString() })
        .where(eq(users.id, existing.id)).run();
    } else {
      this.opened.db.insert(users).values({ username, displayName: m.displayName || username, role: m.role, passwordHash: hint }).run();
    }
    this.unlocked = { ...this.unlocked, header };
    this.audit(existing ? 'reset_member_password' : 'add_member', `${username} (${m.role})`);
    await this.saveNow();
  }

  async updateMemberRole(username: string, role: Role, displayName?: string) {
    this.opened.db.update(users)
      .set({ role, ...(displayName ? { displayName } : {}), updatedAt: new Date().toISOString() })
      .where(eq(users.username, username)).run();
    this.audit('change_member_role', `${username} → ${role}`);
    await this.saveNow();
  }

  async removeMember(username: string) {
    if (username === this.user?.username) throw new Error("You can't remove yourself");
    this.unlocked = { ...this.unlocked, header: await E.removeUser(this.unlocked, username) };
    this.opened.db.update(users).set({ isActive: false, passwordHash: '' }).where(eq(users.username, username)).run();
    this.audit('remove_member', username);
    await this.saveNow();
  }

  /** After a recovery-key unlock: become (or create) an admin with a new password. */
  async claimAsAdmin(username: string, displayName: string, password: string) {
    const m: Member = { username: username.trim(), displayName: displayName.trim() || username.trim(), role: 'admin' };
    this.user = m;
    await this.takeLock().catch(() => {});
    if (this.lockedBy) throw new Error(`${this.lockedBy.owner} is editing right now. Try again in a few minutes.`);
    await this.setMember(m, password);
  }

  async changeOwnPassword(password: string) {
    if (!this.user) throw new Error('Not signed in');
    await this.setMember(this.user, password);
  }

  async rotateRecoveryKey(): Promise<string> {
    const { header, recoveryKey } = await E.rotateRecoveryKey(this.unlocked);
    this.unlocked = { ...this.unlocked, header };
    this.audit('new_recovery_key');
    await this.saveNow();
    return recoveryKey;
  }

  // ---------- saving ----------
  onState(fn: (s: SaveState, err?: unknown) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private setState(s: SaveState, err?: unknown) {
    this.state = s;
    this.lastError = err ?? null;
    this.listeners.forEach((l) => l(s, err));
  }

  /** Called after each change; saves after a short delay. */
  markDirty() {
    this.dirty = true;
    this.setState('dirty');
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.saveNow().catch(() => {}), this.saveDelayMs);
  }

  get hasUnsavedChanges() { return this.dirty || this.state === 'saving'; }

  /** Saves now (waits for any in-flight save first). */
  async saveNow(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.saving) await this.saving.catch(() => {});
    if (this.lockedBy) throw new Error(`${this.lockedBy.owner} is editing; this window is read-only.`);
    this.dirty = false;
    this.setState('saving');
    this.saving = (async () => {
      const plain = exportDatabase(this.opened); // throws on integrity failure / newer schema
      const file = await E.encryptFile(this.unlocked, plain);
      try {
        await this.adapter.save(file);
        await pendingStore.set(this.churchId, null);
      } catch (e) {
        if (e instanceof AuthExpiredError) await pendingStore.set(this.churchId, { file, savedAt: new Date().toISOString() });
        throw e;
      }
    })();
    try {
      await this.saving;
      this.setState(this.dirty ? 'dirty' : 'saved');
    } catch (e) {
      this.dirty = true;
      this.setState('error', e);
      throw e;
    } finally {
      this.saving = null;
    }
  }

  /** Decrypts a previous version for preview or restore. */
  async loadVersion(id: string): Promise<OpenedDb> {
    const file = await this.adapter.loadVersion(id);
    return openDatabase(await E.decryptFile(this.unlocked, file));
  }

  /** Replaces the current database with a previous version and saves it. */
  async restoreVersion(id: string) {
    const prev = await this.loadVersion(id);
    this.opened.raw.close();
    this.opened = prev;
    this.audit('restore_version', id);
    await this.saveNow();
  }

  /**
   * The window is closing (not signing out). If everything is saved, let others edit right
   * away instead of waiting for the lock to expire. The lock stays set here: if the page comes
   * back from the browser's back/forward cache, the next heartbeat writes it again.
   */
  releaseLockOnExit() {
    if (!this.lock || this.hasUnsavedChanges || !hasLockStore(this.adapter)) return;
    this.adapter.releaseLockOnExit?.();
  }

  close() {
    if (this.timer) clearTimeout(this.timer);
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.lock && hasLockStore(this.adapter)) void releaseLock(this.adapter, this.lock).catch(() => {});
    this.lock = null;
    this.opened.raw.close();
    this.unlocked.dataKey.fill(0);
  }
}
