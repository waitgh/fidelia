import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, type AppDb } from './db';
import * as P from './pledges';
import { createDonor } from './donors';
import { createCategory } from './categories';
import { createBatch } from './batches';
import { createOffering } from './offerings';

let db: AppDb;
let donorId: number, catId: number, otherCat: number;
beforeEach(async () => {
  db = (await openDatabase()).db;
  donorId = createDonor(db, { firstName: 'A', lastName: 'B' }).id;
  catId = createCategory(db, { name: 'Building' }).id;
  otherCat = createCategory(db, { name: 'General' }).id;
});

describe('pledges', () => {
  it('computes fulfillment from matching offerings in range only', () => {
    const p = P.createPledge(db, { donorId, categoryId: catId, amount: 1000, startDate: '2026-01-01', endDate: '2026-12-31' });
    const inRange = createBatch(db, { date: '2026-03-01' }).id;
    const outRange = createBatch(db, { date: '2025-12-31' }).id;
    createOffering(db, { batchId: inRange, donorId, categoryId: catId, amount: 255, paymentMethod: 'check' });
    createOffering(db, { batchId: inRange, donorId, categoryId: otherCat, amount: 999, paymentMethod: 'check' });
    createOffering(db, { batchId: outRange, donorId, categoryId: catId, amount: 999, paymentMethod: 'check' });
    expect(P.getPledge(db, p.id)).toMatchObject({ givenAmount: 255, fulfillmentPct: 26, categoryName: 'Building' });
    expect(P.listPledges(db, { year: '2026' })).toHaveLength(1);
    expect(P.listPledges(db, { year: '2025' })).toHaveLength(0);
  });
  it('validates, updates, deletes', () => {
    expect(() => P.createPledge(db, { donorId })).toThrow('required');
    expect(() => P.createPledge(db, { donorId, categoryId: catId, amount: -5, startDate: 'a', endDate: 'b' })).toThrow('positive');
    const p = P.createPledge(db, { donorId, categoryId: catId, amount: 10, startDate: '2026-01-01', endDate: '2026-12-31' });
    expect(P.updatePledge(db, p.id, { amount: '20' }).amount).toBe(20);
    expect(() => P.updatePledge(db, p.id, { amount: 0 })).toThrow('positive');
    P.deletePledge(db, p.id);
    expect(() => P.getPledge(db, p.id)).toThrow('not found');
  });
});
