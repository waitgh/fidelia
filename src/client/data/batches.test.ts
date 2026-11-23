import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, type AppDb } from './db';
import * as B from './batches';
import * as O from './offerings';
import { createDonor } from './donors';
import { createCategory } from './categories';

let db: AppDb;
let donorId: number, catId: number, lunchId: number;
beforeEach(async () => {
  db = (await openDatabase()).db;
  donorId = createDonor(db, { firstName: 'A', lastName: 'B' }).id;
  catId = createCategory(db, { name: 'General' }).id;
  lunchId = createCategory(db, { name: 'Lunch' }).id;
});

const add = (batchId: number, amount: number, paymentMethod = 'check', categoryId = catId) =>
  O.createOffering(db, { batchId, donorId, categoryId, amount, paymentMethod });

describe('batches and offerings', () => {
  it('lists batches newest first with totals, search and paging', () => {
    const b1 = B.createBatch(db, { date: '2026-01-04', description: 'Sunday' });
    const b2 = B.createBatch(db, { date: '2026-01-11', description: 'Special' });
    add(b1.id, 100); add(b1.id, 50.25);
    const { rows, total } = B.listBatches(db);
    expect(total).toBe(2);
    expect(rows.map((r) => r.id)).toEqual([b2.id, b1.id]);
    expect(rows[1]).toMatchObject({ totalAmount: 150.25, offeringCount: 2 });
    expect(rows[0]).toMatchObject({ totalAmount: 0, offeringCount: 0 });
    expect(B.listBatches(db, { description: 'spec' }).total).toBe(1);
    expect(B.listBatches(db, { limit: 1, offset: 1 }).rows[0]!.id).toBe(b1.id);
  });

  it('computes fees for venmo/paypal but not lunch or cash', () => {
    const b = B.createBatch(db, { date: '2026-01-04' });
    expect(add(b.id, 100, 'venmo').feeAmount).toBe(2.0);
    expect(add(b.id, 100, 'paypal').feeAmount).toBe(2.48);
    expect(add(b.id, 100, 'venmo', lunchId).feeAmount).toBeNull();
    expect(add(b.id, 100, 'cash').feeAmount).toBeNull();
    const o = add(b.id, 10, 'cash');
    expect(O.updateOffering(db, o.id, { paymentMethod: 'venmo' }).feeAmount).toBe(0.29);
  });

  it('getBatch returns joined offerings and total', () => {
    const b = B.createBatch(db, { date: '2026-01-04' });
    add(b.id, 20); add(b.id, 30);
    const r = B.getBatch(db, b.id);
    expect(r.totalAmount).toBe(50);
    expect(r.offerings[0]).toMatchObject({ donorLastName: 'B', categoryName: 'General' });
  });

  it('blocks edits on closed batches until reopened', () => {
    const b = B.createBatch(db, { date: '2026-01-04' });
    const o = add(b.id, 20);
    B.closeBatch(db, b.id);
    expect(() => add(b.id, 5)).toThrow('closed batch');
    expect(() => O.updateOffering(db, o.id, { amount: 25 })).toThrow('Reopen');
    expect(() => O.deleteOffering(db, o.id)).toThrow('Reopen');
    B.reopenBatch(db, b.id);
    expect(O.updateOffering(db, o.id, { amount: 25 }).amount).toBe(25);
  });

  it('validates amounts and required fields', () => {
    const b = B.createBatch(db, { date: '2026-01-04' });
    expect(() => add(b.id, 0)).toThrow('positive');
    expect(() => O.createOffering(db, { batchId: b.id })).toThrow('required');
    expect(() => B.createBatch(db, {})).toThrow('Date is required');
  });

  it('reassigns offerings and deletes batch with its offerings', () => {
    const b1 = B.createBatch(db, { date: '2026-01-04' });
    const b2 = B.createBatch(db, { date: '2026-01-11' });
    const o = add(b1.id, 20);
    B.closeBatch(db, b1.id);
    expect(O.reassignOffering(db, o.id, b2.id).batchId).toBe(b2.id);
    B.deleteBatch(db, b2.id);
    expect(O.listOfferings(db)).toHaveLength(0);
    expect(() => B.getBatch(db, b2.id)).toThrow('not found');
  });

  it('filters offerings by date range and donor', () => {
    const b1 = B.createBatch(db, { date: '2026-01-04' });
    const b2 = B.createBatch(db, { date: '2026-02-01' });
    add(b1.id, 1); add(b2.id, 2);
    expect(O.listOfferings(db, { startDate: '2026-01-15' }).map((o) => o.amount)).toEqual([2]);
    expect(O.listOfferings(db, { donorId: String(donorId), endDate: '2026-01-31' }).map((o) => o.amount)).toEqual([1]);
  });

  it('stores designations (trimmed, blank = none) and suggests them by use', () => {
    const b = B.createBatch(db, { date: '2026-01-04' });
    const o1 = O.createOffering(db, { batchId: b.id, donorId, categoryId: catId, amount: 10, paymentMethod: 'cash', designation: '  Smith ' });
    O.createOffering(db, { batchId: b.id, donorId, categoryId: catId, amount: 10, paymentMethod: 'cash', designation: 'Smith' });
    O.createOffering(db, { batchId: b.id, donorId, categoryId: catId, amount: 10, paymentMethod: 'cash', designation: 'Adams' });
    const o4 = O.createOffering(db, { batchId: b.id, donorId, categoryId: catId, amount: 10, paymentMethod: 'cash', designation: '   ' });
    expect(o1.designation).toBe('Smith');
    expect(o4.designation).toBeNull();
    expect(O.listDesignations(db)).toEqual(['Smith', 'Adams']);
    expect(O.updateOffering(db, o1.id, { designation: '' })!.designation).toBeNull();
    expect(O.updateOffering(db, o4.id, { amount: 20 })!.designation).toBeNull();
  });

  it('records attendance on a batch, open or closed', () => {
    const b = B.createBatch(db, { date: '2026-01-04' });
    B.closeBatch(db, b.id);
    expect(B.updateBatch(db, b.id, { attendanceAdults: '85', attendanceChildren: 20 })).toMatchObject({ attendanceAdults: 85, attendanceChildren: 20 });
    expect(B.updateBatch(db, b.id, { attendanceChildren: '' }).attendanceChildren).toBeNull();
    expect(() => B.updateBatch(db, b.id, { attendanceAdults: -1 })).toThrow('whole number');
    expect(() => B.updateBatch(db, b.id, { attendanceAdults: 2.5 })).toThrow('whole number');
  });
});
