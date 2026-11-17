import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, type AppDb } from './db';
import * as D from './donors';

let db: AppDb;
beforeEach(async () => { db = (await openDatabase()).db; });

describe('donors', () => {
  it('creates, gets, lists sorted by last/first name', () => {
    D.createDonor(db, { firstName: 'Amy', lastName: 'Wang', chineseName: '王爱美' });
    const b = D.createDonor(db, { firstName: 'Bob', lastName: 'Li', envelopeNumber: '12' });
    expect(D.getDonor(db, b.id).firstName).toBe('Bob');
    expect(D.listDonors(db).map((d) => d.lastName)).toEqual(['Li', 'Wang']);
    expect(D.listDonors(db)[0]!.offeringCount).toBe(0);
  });
  it('searches by full name, envelope and chinese name', () => {
    D.createDonor(db, { firstName: 'Amy', lastName: 'Wang', chineseName: '王爱美' });
    D.createDonor(db, { firstName: 'Bob', lastName: 'Li', envelopeNumber: '12' });
    expect(D.listDonors(db, 'amy wang').map((d) => d.firstName)).toEqual(['Amy']);
    expect(D.listDonors(db, 'Wang, Amy').map((d) => d.firstName)).toEqual(['Amy']);
    expect(D.listDonors(db, '12').map((d) => d.firstName)).toEqual(['Bob']);
    expect(D.listDonors(db, '爱美').map((d) => d.firstName)).toEqual(['Amy']);
  });
  it('hides inactive unless asked', () => {
    const a = D.createDonor(db, { firstName: 'A', lastName: 'Z' });
    D.updateDonor(db, a.id, { isActive: false });
    expect(D.listDonors(db)).toHaveLength(0);
    expect(D.listDonors(db, undefined, true)).toHaveLength(1);
    expect(D.listDonors(db, 'z', true)).toHaveLength(1);
  });
  it('validates names and envelope uniqueness', () => {
    expect(() => D.createDonor(db, { firstName: 'A' })).toThrow('required');
    const a = D.createDonor(db, { firstName: 'A', lastName: 'B', envelopeNumber: '5' });
    expect(D.isEnvelopeTaken(db, '5')).toEqual({ taken: true });
    expect(D.isEnvelopeTaken(db, '5', a.id)).toEqual({ taken: false });
    expect(() => D.createDonor(db, { firstName: 'C', lastName: 'D', envelopeNumber: '5' })).toThrow('Envelope');
  });
  it('deletes only donors with no history', () => {
    const a = D.createDonor(db, { firstName: 'A', lastName: 'B' });
    expect(D.deleteDonor(db, a.id)).toEqual({ ok: true });
    expect(() => D.getDonor(db, a.id)).toThrow('not found');
  });
});

describe('importDonors', () => {
  it('maps common header spellings, skips bad rows and duplicates, and is idempotent', () => {
    D.createDonor(db, { firstName: 'Old', lastName: 'Timer', envelopeNumber: '1' });
    const rows: Record<string, string>[] = [
      { 'First Name': 'Amy', last_name: 'Wang', chinese_name: '王爱美', envelope_number: '2', is_active: '1', id: '99' },
      { firstName: 'Bob', lastName: 'Li', isActive: '0', email: 'bob@x.org' },
      { 'First Name': 'Dup', last_name: 'Env', envelope_number: '1' },
      { 'First Name': '', last_name: 'NoFirst' },
    ];
    const r = D.importDonors(db, rows);
    expect(r.created).toBe(2);
    expect(r.skipped.map((s) => s.row)).toEqual([4, 5]);
    const all = D.listDonors(db, undefined, true);
    expect(all).toHaveLength(3);
    const amy = all.find((d) => d.firstName === 'Amy')!;
    expect(amy).toMatchObject({ chineseName: '王爱美', envelopeNumber: '2', isActive: true });
    expect(amy.id).not.toBe(99);
    expect(all.find((d) => d.firstName === 'Bob')!.isActive).toBe(false);
    expect(D.importDonors(db, rows).created).toBe(0);
    expect(D.listDonors(db, undefined, true)).toHaveLength(3);
  });
});
