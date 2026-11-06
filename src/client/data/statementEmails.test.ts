import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, type AppDb } from './db';
import * as S from './statementEmails';
import { createDonor } from './donors';
import { createCategory } from './categories';
import { createBatch } from './batches';
import { createOffering } from './offerings';

let db: AppDb;
let amy: number, bob: number;
beforeEach(async () => {
  db = (await openDatabase()).db;
  amy = createDonor(db, { firstName: 'Amy', lastName: 'Wang', email: 'amy@x.org; bad, amy2@x.org', spouseName: 'Dan' }).id;
  bob = createDonor(db, { firstName: 'Bob', lastName: 'Li' }).id;
  createDonor(db, { firstName: 'Non', lastName: 'Giver', email: 'n@x.org' });
  const g = createCategory(db, { name: 'General' }).id;
  const l = createCategory(db, { name: 'Lunch' }).id;
  const b = createBatch(db, { date: '2026-02-01' }).id;
  createOffering(db, { batchId: b, donorId: amy, categoryId: g, amount: 100.005, paymentMethod: 'check' });
  createOffering(db, { batchId: b, donorId: amy, categoryId: l, amount: 10, paymentMethod: 'cash' });
  createOffering(db, { batchId: b, donorId: bob, categoryId: g, amount: 5, paymentMethod: 'cash' });
});

describe('statement emails', () => {
  it('parses multiple addresses', () => {
    expect(S.parseEmails('a@b.co / c@d.co, nope')).toEqual(['a@b.co', 'c@d.co']);
  });
  it('lists givers sorted by last name with totals and send status', () => {
    const r = S.listRecipients(db, '2026-01-01', '2026-12-31');
    expect(r.map((x) => x.name)).toEqual(['Bob Li', 'Amy Wang & Dan']);
    expect(r[1]).toMatchObject({ total: 100.01, validEmails: ['amy@x.org', 'amy2@x.org'], status: 'not_sent' });
    S.recordAttempt(db, { donorId: amy, startDate: '2026-01-01', endDate: '2026-12-31', to: ['amy@x.org'], status: 'failed', error: 'boom', sentBy: 't' });
    expect(S.listRecipients(db, '2026-01-01', '2026-12-31')[1]).toMatchObject({ status: 'failed', lastError: 'boom' });
    S.recordAttempt(db, { donorId: amy, startDate: '2026-01-01', endDate: '2026-12-31', to: ['amy@x.org'], status: 'sent', sentBy: 't' });
    S.recordAttempt(db, { donorId: amy, startDate: '2026-01-01', endDate: '2026-12-31', to: ['amy@x.org'], status: 'failed', sentBy: 't' });
    expect(S.listRecipients(db, '2026-01-01', '2026-12-31')[1]!.status).toBe('sent');
    expect(S.listRecipients(db, '2026-01-01', '2026-06-30')[1]!.status).toBe('not_sent');
  });
  it('validates send requests', () => {
    const base = { donorId: amy, startDate: '2026-01-01', endDate: '2026-12-31', subject: 'Hi', body: 'b', pdfBase64: 'x', filename: 'a.pdf' };
    expect(S.prepareSend(db, base)).toMatchObject({ isTest: false, to: ['amy@x.org', 'amy2@x.org'], filename: 'a.pdf' });
    expect(S.prepareSend(db, { ...base, testTo: 'me@x.org', filename: '../evil' })).toMatchObject({ isTest: true, subject: '[TEST] Hi', filename: 'Contribution Statement.pdf' });
    expect(() => S.prepareSend(db, { ...base, donorId: bob })).toThrow('no valid email');
    expect(() => S.prepareSend(db, { ...base, subject: ' ' })).toThrow('required');
  });
});
