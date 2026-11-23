import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, type AppDb } from './db';
import * as B from './batches';
import * as O from './offerings';
import { createDonor, listDonors } from './donors';
import { createCategory } from './categories';
import { importBatches, planBatchImport, parseImportDate } from './batchImport';
import { batchToCsv } from '../lib/batchExport';
import { parseCsvObjects, toCsv } from '../lib/csv';

let db: AppDb;
let ann: number, wang: number, general: number, mission: number;
beforeEach(async () => {
  db = (await openDatabase()).db;
  ann = createDonor(db, { firstName: 'Ann', lastName: 'Lee' }).id;
  wang = createDonor(db, { firstName: '王', lastName: '李', congregation: 'Mandarin' }).id;
  general = createCategory(db, { name: 'General' }).id;
  mission = createCategory(db, { name: 'Mission' }).id;
});

const exportRows = (batchId: number) => parseCsvObjects(batchToCsv(B.getBatch(db, batchId)));
const strip = (b: ReturnType<typeof B.getBatch>) =>
  b.offerings.map(({ donorId, categoryId, amount, feeAmount, paymentMethod, checkNumber, notes, designation }) =>
    ({ donorId, categoryId, amount, feeAmount, paymentMethod, checkNumber, notes, designation })).sort((x, y) => x.amount - y.amount);

describe('batch import', () => {
  it('round-trips an exported batch exactly', () => {
    const b = B.createBatch(db, { date: '2026-11-22', description: 'Sunday, "main"' });
    O.createOffering(db, { batchId: b.id, donorId: ann, categoryId: general, amount: 100, paymentMethod: 'check', checkNumber: '1001' });
    O.createOffering(db, { batchId: b.id, donorId: wang, categoryId: mission, amount: 50.1, paymentMethod: 'paypal', notes: '=thanks, pastor', designation: 'Smith family' });
    O.createOffering(db, { batchId: b.id, donorId: ann, categoryId: general, amount: 20, paymentMethod: 'cash' });
    B.closeBatch(db, b.id);

    const rows = exportRows(b.id);
    const plan = planBatchImport(db, rows);
    expect(plan.errors).toEqual([]);
    expect(plan.newDonors).toEqual([]);
    expect(plan.batches).toHaveLength(1);
    expect(plan.batches[0]).toMatchObject({ date: '2026-11-22', total: 170.1, possibleDuplicateId: b.id });

    const r = importBatches(db, rows);
    expect(r).toMatchObject({ offeringCount: 3, donorsAdded: 0 });
    const copy = B.getBatch(db, r.batchIds[0]!);
    expect(copy).toMatchObject({ date: '2026-11-22', description: 'Sunday, "main"', status: 'open', totalAmount: 170.1 });
    expect(strip(copy)).toEqual(strip(B.getBatch(db, b.id)));
  });

  it('adds donors it cannot find, accepts Excel-style dates and $ amounts, splits by date', () => {
    const rows = parseCsvObjects(toCsv([
      ['Date', 'Donor Last Name', 'Donor First Name', 'Congregation', 'Category', 'Method', 'Amount'],
      ['11/22/2026', 'New', 'Person', 'English', 'general', 'Zelle', '$1,250.00'],
      ['2026-11-29', 'Lee', 'ann', '', 'Mission', 'check', '10'],
      ['2026-11-29', 'new', 'person', '', 'General', 'cash', '5'],
      ['Total', '', '', '', '', '', '1265'],
    ]));
    const r = importBatches(db, rows);
    expect(r).toMatchObject({ offeringCount: 3, donorsAdded: 1 });
    expect(r.batchIds.map((id) => B.getBatch(db, id).date)).toEqual(['2026-11-22', '2026-11-29']);
    expect(B.getBatch(db, r.batchIds[0]!).totalAmount).toBe(1250);
    expect(listDonors(db).filter((d) => d.lastName === 'New')).toHaveLength(1);
  });

  it('writes nothing when any row is bad', () => {
    const rows = parseCsvObjects(toCsv([
      ['Date', 'Donor Last Name', 'Donor First Name', 'Category', 'Method', 'Amount'],
      ['2026-11-22', 'Lee', 'Ann', 'General', 'check', '10'],
      ['2026-11-22', 'Lee', 'Ann', 'Nope', 'check', '10'],
      ['2026-11-22', 'Lee', 'Ann', 'General', 'bitcoin', '10'],
      ['2026-11-22', 'Lee', 'Ann', 'General', 'check', '-3'],
      ['2026-02-30', 'Lee', 'Ann', 'General', 'check', '3'],
      ['2026-11-22', 'Other', 'Guy', 'General', 'check', '3'],
    ]));
    const plan = planBatchImport(db, rows);
    expect(plan.errors.map((e) => e.row)).toEqual([3, 4, 5, 6]);
    expect(() => importBatches(db, rows)).toThrow(/Nothing imported: 4 problem/);
    expect(B.listBatches(db).total).toBe(0);
    expect(listDonors(db).some((d) => d.lastName === 'Other')).toBe(false);
  });

  it('rejects a file without the export columns, and ambiguous donor names', () => {
    expect(planBatchImport(db, [{ Name: 'x' }]).errors[0]!.message).toMatch(/Missing column/);
    createDonor(db, { firstName: 'Ann', lastName: 'Lee' });
    const rows = parseCsvObjects(toCsv([
      ['Date', 'Donor Last Name', 'Donor First Name', 'Category', 'Method', 'Amount'],
      ['2026-11-22', 'Lee', 'Ann', 'General', 'check', '10'],
    ]));
    expect(planBatchImport(db, rows).errors[0]!.message).toMatch(/2 donors are named Ann Lee/);
  });

  it('parses dates strictly', () => {
    expect(parseImportDate('2026-1-5')).toBe('2026-01-05');
    expect(parseImportDate('1/5/2026')).toBe('2026-01-05');
    expect(parseImportDate('2026-13-01')).toBeNull();
    expect(parseImportDate('Nov 5')).toBeNull();
  });
});
