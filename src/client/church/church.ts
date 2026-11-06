// A church session: an unlocked, decrypted database plus where it is stored.
// Saving = integrity check → export → encrypt → upload. Plaintext never leaves the browser.
import { eq } from 'drizzle-orm';
import { users } from '../../db/schema';
import { openDatabase, exportDatabase, type OpenedDb } from '../data/db';
import { updateSetting } from '../data/settings';
import type { StorageAdapter } from '../storage/types';
import * as E from '../crypto/envelope';

export type Role = 'admin' | 'bookkeeper' | 'viewer';
export interface Member {
  username: string;
  displayName: string;
  role: Role;
}

export type SaveState = 'saved' | 'dirty' | 'saving' | 'error';

export class Church {
  private dirty = false;
  private saving: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<(s: SaveState, err?: unknown) => void>();
  state: SaveState = 'saved';
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
  get readOnly() { return this.opened.readOnly || this.user?.role === 'viewer'; }

  static async create(
    adapter: StorageAdapter,
    p: { churchName: string; username: string; displayName: string; password: string },
  ): Promise<{ church: Church; recoveryKey: string }> {
    if ((await adapter.load()) !== null) throw new Error('A church file already exists here');
    const { unlocked, recoveryKey } = await E.createChurchKeys(p.username, p.password);
    const opened = await openDatabase();
    const member: Member = { username: p.username.trim(), displayName: p.displayName.trim() || p.username.trim(), role: 'admin' };
    opened.db.insert(users).values({ ...member, passwordHash: await E.usernameHint(unlocked.header.churchId, member.username) }).run();
    if (p.churchName) updateSetting(opened.db, 'churchName', p.churchName);
    const church = new Church(adapter, unlocked, opened, member);
    await church.saveNow();
    return { church, recoveryKey };
  }

  private static async loadFile(adapter: StorageAdapter) {
    const file = await adapter.load();
    if (!file) throw new Error('No church file found at this location');
    return file;
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
    return new Church(adapter, unlocked, opened, { username: row.username, displayName: row.displayName, role: row.role as Role });
  }

  static async unlockWithRecoveryKey(adapter: StorageAdapter, recoveryKey: string): Promise<Church> {
    const file = await Church.loadFile(adapter);
    const unlocked = await E.unlockWithRecoveryKey(E.readHeader(file), recoveryKey);
    const opened = await openDatabase(await E.decryptFile(unlocked, file));
    return new Church(adapter, unlocked, opened, null);
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
    if (!username) throw new Error('Username is required');
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
    await this.saveNow();
  }

  async updateMemberRole(username: string, role: Role, displayName?: string) {
    this.opened.db.update(users)
      .set({ role, ...(displayName ? { displayName } : {}), updatedAt: new Date().toISOString() })
      .where(eq(users.username, username)).run();
    await this.saveNow();
  }

  async removeMember(username: string) {
    if (username === this.user?.username) throw new Error("You can't remove yourself");
    this.unlocked = { ...this.unlocked, header: await E.removeUser(this.unlocked, username) };
    this.opened.db.update(users).set({ isActive: false, passwordHash: '' }).where(eq(users.username, username)).run();
    await this.saveNow();
  }

  /** After a recovery-key unlock: become (or create) an admin with a new password. */
  async claimAsAdmin(username: string, displayName: string, password: string) {
    const m: Member = { username: username.trim(), displayName: displayName.trim() || username.trim(), role: 'admin' };
    await this.setMember(m, password);
    this.user = m;
  }

  async changeOwnPassword(password: string) {
    if (!this.user) throw new Error('Not signed in');
    await this.setMember(this.user, password);
  }

  async rotateRecoveryKey(): Promise<string> {
    const { header, recoveryKey } = await E.rotateRecoveryKey(this.unlocked);
    this.unlocked = { ...this.unlocked, header };
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
    this.dirty = false;
    this.setState('saving');
    this.saving = (async () => {
      const plain = exportDatabase(this.opened); // throws on integrity failure / newer schema
      const file = await E.encryptFile(this.unlocked, plain);
      await this.adapter.save(file);
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
    await this.saveNow();
  }

  close() {
    if (this.timer) clearTimeout(this.timer);
    this.opened.raw.close();
    this.unlocked.dataKey.fill(0);
  }
}
