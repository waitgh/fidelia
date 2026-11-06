import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, type AppDb } from './db';
import * as R from './reports';
import { createDonor } from './donors';
import { createCategory } from './categories';
import { createBatch } from './batches';
import { createOffering } from './offerings';
import { createPledge } from './pledges';

let db: AppDb;
let amy: number, bob: number, carl: number, general: number, lunch: number, building: number;

beforeEach(async () => {
  db = (await openDatabase()).db;
  amy = createDonor(db, { firstName: 'Amy', lastName: 'Wang', congregation: 'English' }).id;
  bob = createDonor(db, { firstName: 'Bob', lastName: 'Li', congregation: 'Mandarin' }).id;
  carl = createDonor(db, { firstName: 'Carl', lastName: 'Zhu' }).id; // no congregation
  general = createCategory(db, { name: 'General' }).id;
  lunch = createCategory(db, { name: 'Lunch' }).id;
  building = createCategory(db, { name: 'Building' }).id;
  const jan = createBatch(db, { date: '2026-01-04' }).id;
  const apr = createBatch(db, { date: '2026-04-05' }).id;
  const old = createBatch(db, { date: '2025-12-28' }).id;
  const o = (batchId: number, donorId: number, categoryId: number, amount: number, paymentMethod = 'check') =>
    createOffering(db, { batchId, donorId, categoryId, amount, paymentMethod });
  o(jan, amy, general, 100);
  o(jan, amy, lunch, 10, 'cash');
  o(apr, amy, building, 200);
  o(apr, amy, general, 50, 'charitable');
  o(jan, bob, general, 300);
  o(apr, carl, general, 25);
  o(old, amy, general, 999);
  createPledge(db, { donorId: amy, categoryId: building, amount: 400, startDate: '2026-01-01', endDate: '2026-12-31' });
});

describe('donor statement', () => {
  it('lists offerings in range and excludes lunch and charitable from the deductible total', () => {
    const s = R.donorStatement(db, amy, '2026-01-01', '2026-12-31');
    expect(s.offerings).toHaveLength(4);
    expect(s.offerings.map((o) => o.date)).toEqual(['2026-01-04', '2026-01-04', '2026-04-05', '2026-04-05']);
    expect(s.totalsByCategory).toEqual({ General: 150, Lunch: 10, Building: 200 });
    expect(s.grandTotal).toBe(300);
    expect(s.pledges).toEqual([{ category: 'Building', pledgedAmount: 400, givenAmount: 200, fulfillmentPct: 50 }]);
  });
  it('validates input', () => {
    expect(() => R.donorStatement(db, 9999, '2026-01-01', '2026-12-31')).toThrow('not found');
    expect(() => R.donorStatement(db, amy, '', '2026-12-31')).toThrow('required');
  });
});

describe('congregation summary', () => {
  it('totals overall and per congregation, with Unassigned', () => {
    const s = R.congregationSummary(db, '2026-01-01', '2026-12-31');
    expect(s.grandTotal).toBe(685);
    expect(s.totalOfferings).toBe(6);
    expect(s.uniqueDonors).toBe(3);
    expect(s.congregations.map((c) => [c.congregation, c.totalAmount])).toEqual([
      ['English', 360], ['Mandarin', 300], ['Unassigned', 25],
    ]);
    const eng = s.congregations[0]!;
    expect(eng.categories.map((c) => [c.categoryName, c.totalAmount])).toEqual([['Building', 200], ['General', 150], ['Lunch', 10]]);
    expect(eng.offeringDetails).toHaveLength(4);
    expect(s.categories[0]).toMatchObject({ categoryName: 'General', totalAmount: 475 });
  });
  it('filters by congregation and by __none__', () => {
    expect(R.congregationSummary(db, '2026-01-01', '2026-12-31', 'Mandarin').grandTotal).toBe(300);
    expect(R.congregationSummary(db, '2026-01-01', '2026-12-31', '__none__').grandTotal).toBe(25);
  });
});

describe('dashboard', () => {
  it('reports year and month totals for the given date', () => {
    const d = R.dashboard(db, new Date(2026, 3, 15));
    expect(d.yearlyTotal).toBe(685);
    expect(d.monthlyTotal).toBe(275);
    expect(d.monthlyCount).toBe(3);
    expect(d.activeDonorCount).toBe(3);
    expect(d.recentBatches[0]!.date).toBe('2026-04-05');
  });
});

describe('trends', () => {
  it('groups by quarter and ranks names', () => {
    const t = R.trends(db, 'quarterly', '2026-01-01', '2026-12-31');
    expect(t.totals.map((r) => [r.periodKey, r.totalAmount])).toEqual([['2026-Q1', 410], ['2026-Q2', 275]]);
    expect(t.totals[0]!.period).toBe('2026 Q1');
    expect(t.categoryNames[0]).toBe('General');
    expect(t.congregationNames).toEqual(['English', 'Mandarin', 'Unassigned']);
  });
  it('labels months and rejects bad periods', () => {
    expect(R.trends(db, 'monthly', '2026-01-01', '2026-01-31').totals[0]!.period).toBe('Jan 2026');
    expect(() => R.trends(db, 'daily' as any, '2026-01-01', '2026-01-31')).toThrow('period');
  });
});

describe('demo seed', () => {
  it('produces a consistent dataset', async () => {
    const { seedDemo } = await import('./seed');
    const fresh = (await openDatabase()).db;
    seedDemo(fresh, 2026);
    const s = R.congregationSummary(fresh, '2026-01-01', '2026-12-31');
    expect(s.grandTotal).toBeGreaterThan(0);
    expect(s.congregations.reduce((a, c) => a + c.totalAmount, 0)).toBeCloseTo(s.grandTotal, 6);
  });
});
