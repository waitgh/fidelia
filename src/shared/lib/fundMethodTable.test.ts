import { describe, it, expect } from 'vitest';
import { buildFundMethodTable } from './fundMethodTable';

const cell = (categoryName: string, paymentMethod: string, totalAmount: number, offeringCount = 1, feeAmount = 0) =>
  ({ categoryName, paymentMethod, totalAmount, offeringCount, feeAmount });

describe('buildFundMethodTable', () => {
  it('crosses funds with methods and subtotals both ways', () => {
    const t = buildFundMethodTable([
      cell('Mission', 'check', 300, 2),
      cell('General', 'cash', 320.1, 5),
      cell('General', 'check', 1500, 10),
      cell('Youth', 'paypal', 100, 1, 2.48),
      cell('General', 'zelle', 0.2, 1),
      cell('Building', 'cash', 0.1, 1),
      cell('Empty', 'cash', 0, 0),
    ], ['cash', 'check', 'zelle', 'paypal', 'venmo']);
    expect(t.methods).toEqual(['cash', 'check', 'zelle', 'paypal']);
    expect(t.rows.map((r) => r.categoryName)).toEqual(['General', 'Building', 'Mission', 'Youth']);
    expect(t.rows[0]!.total).toEqual({ amount: 1820.3, count: 16, fees: 0 });
    expect(t.rows[0]!.byMethod.check).toEqual({ amount: 1500, count: 10, fees: 0 });
    expect(t.rows[2]!.byMethod.cash).toBeUndefined();
    expect(t.totals.byMethod.cash).toEqual({ amount: 320.2, count: 6, fees: 0 });
    expect(t.totals.byMethod.paypal!.fees).toBe(2.48);
    expect(t.totals.total).toEqual({ amount: 2220.4, count: 20, fees: 2.48 });
  });

  it('adds cents exactly and puts unknown methods last', () => {
    const t = buildFundMethodTable(Array.from({ length: 10 }, () => cell('General', 'crypto', 0.1)).concat(cell('General', 'cash', 1)), ['cash']);
    expect(t.methods).toEqual(['cash', 'crypto']);
    expect(t.totals.byMethod.crypto!.amount).toBe(1);
    expect(t.totals.total.amount).toBe(2);
  });

  it('handles no offerings', () => {
    expect(buildFundMethodTable([], ['cash'])).toEqual({ methods: [], rows: [], totals: { byMethod: {}, total: { amount: 0, count: 0, fees: 0 } } });
  });
});
