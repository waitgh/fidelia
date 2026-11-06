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
