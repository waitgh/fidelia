import { describe, it, expect } from 'vitest';
import * as E from './envelope';

const data = new TextEncoder().encode('SQLite format 3\0'.repeat(500));

describe('envelope encryption', () => {
  it('round-trips with password and recovery key', async () => {
    const { unlocked, recoveryKey } = await E.createChurchKeys('Treasurer', 'correct horse');
    expect(recoveryKey).toMatch(/^([A-Z2-9]{4}-){6}[A-Z2-9]{2}$/);
    const file = await E.encryptFile(unlocked, data);
    expect(file.length).toBeLessThan(data.length); // gzip
    const header = E.readHeader(file);
    expect(JSON.stringify(header)).not.toContain('Treasurer');

    const byPw = await E.unlockWithPassword(header, ' treasurer ', 'correct horse');
    expect(await E.decryptFile(byPw, file)).toEqual(data);
    const byRk = await E.unlockWithRecoveryKey(header, recoveryKey.toLowerCase().replace(/-/g, ' '));
    expect(await E.decryptFile(byRk, file)).toEqual(data);
  });

  it('invites: one code opens once per slot, carries a role, expires, and resists tampering', async () => {
    const { unlocked } = await E.createChurchKeys('a', 'pw');
    const now = Date.UTC(2026, 10, 1);
    const { header, code, slotId } = await E.createInvite(unlocked, 'bookkeeper', now);
    expect(code).toMatch(/^([A-Z2-9]{4}-){3}[A-Z2-9]{4}$/);
    const file = await E.encryptFile({ ...unlocked, header }, data);
    const h = E.readHeader(file);

    const got = await E.unlockWithInvite(h, code.toLowerCase(), now + 1000);
    expect(got.slot.id).toBe(slotId);
    expect(got.slot.role).toBe('bookkeeper');
    expect(await E.decryptFile(got.unlocked, file)).toEqual(data);

    await expect(E.unlockWithInvite(h, E.generateInviteCode(), now)).rejects.toThrow(E.InviteError);
    await expect(E.unlockWithInvite(h, code, now + (E.INVITE_DAYS + 1) * 86_400_000)).rejects.toThrow(/expired/);
    // Editing the role (or expiry) in the plain header breaks the slot.
    const tampered = { ...h, keyslots: h.keyslots.map((s) => (s.id === slotId ? { ...s, role: 'admin', expires: now * 2 } : s)) };
    await expect(E.unlockWithInvite(tampered, code, now)).rejects.toThrow(E.InviteError);
    // Removing the slot revokes it; password and recovery slots are untouched.
    const revoked = E.removeSlot({ ...unlocked, header: h }, slotId);
    await expect(E.unlockWithInvite(revoked, code, now)).rejects.toThrow(E.InviteError);
    await E.unlockWithPassword(revoked, 'a', 'pw');
  });

  it('rejects wrong password, wrong user, and wrong recovery key', async () => {
    const { unlocked } = await E.createChurchKeys('a', 'pw');
    await expect(E.unlockWithPassword(unlocked.header, 'a', 'nope')).rejects.toThrow(E.WrongPasswordError);
    await expect(E.unlockWithPassword(unlocked.header, 'b', 'pw')).rejects.toThrow(E.WrongPasswordError);
    await expect(E.unlockWithRecoveryKey(unlocked.header, E.generateRecoveryKey())).rejects.toThrow(E.WrongPasswordError);
  });

  it('detects tampering and wrong church', async () => {
    const { unlocked } = await E.createChurchKeys('a', 'pw');
    const file = await E.encryptFile(unlocked, data);
    const bad = file.slice();
    bad[bad.length - 1]! ^= 1;
    await expect(E.decryptFile(unlocked, bad)).rejects.toThrow('damaged');
    const other = await E.createChurchKeys('a', 'pw');
    await expect(E.decryptFile(other.unlocked, file)).rejects.toThrow('different church');
    expect(() => E.readHeader(new Uint8Array(20))).toThrow(E.NotAChurchFileError);
  });

  it('adds, changes and removes users; rotates recovery key', async () => {
    const { unlocked, recoveryKey } = await E.createChurchKeys('a', 'pw');
    let header = await E.setUserPassword(unlocked, 'b', 'pw-b');
    await E.unlockWithPassword(header, 'b', 'pw-b');
    header = await E.setUserPassword({ ...unlocked, header }, 'b', 'new');
    expect(header.keyslots.filter((s) => s.kind === 'password')).toHaveLength(2);
    await expect(E.unlockWithPassword(header, 'b', 'pw-b')).rejects.toThrow();
    header = await E.removeUser({ ...unlocked, header }, 'b');
    await expect(E.unlockWithPassword(header, 'b', 'new')).rejects.toThrow();
    const rot = await E.rotateRecoveryKey({ ...unlocked, header });
    await expect(E.unlockWithRecoveryKey(rot.header, recoveryKey)).rejects.toThrow();
    await E.unlockWithRecoveryKey(rot.header, rot.recoveryKey);
  });
});
