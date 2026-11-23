import { describe, it, expect } from 'vitest';
import { batchToCsv, batchCsvFilename } from './batchExport';
import { parseCsv } from './csv';

const offering = (o: Partial<Parameters<typeof batchToCsv>[0]['offerings'][number]>) => ({
  donorFirstName: 'Ann', donorLastName: 'Lee', donorCongregation: null, categoryName: 'General',
  amount: 100, feeAmount: null, paymentMethod: 'check', checkNumber: '101', notes: null, ...o,
});

describe('batchToCsv', () => {
  it('writes one row per offering plus totals, with fees and net', () => {
    const csv = batchToCsv({
      date: '2026-11-22', description: 'Sunday', status: 'closed',
      offerings: [
        offering({}),
        offering({ donorFirstName: '王', donorLastName: '李', amount: 50.1, feeAmount: 1.75, paymentMethod: 'paypal', checkNumber: null, notes: 'thanks, "pastor"' }),
        offering({ donorLastName: '=HYPERLINK("x")', amount: 0.2 }),
      ],
    });
    const rows = parseCsv(csv);
    expect(rows[0]!).toEqual(['Date', 'Description', 'Donor Last Name', 'Donor First Name', 'Congregation', 'Category', 'Method', 'Check #', 'Amount', 'Fee', 'Net', 'Notes']);
    expect(rows).toHaveLength(5);
    expect(rows[1]!.slice(0, 2)).toEqual(['2026-11-22', 'Sunday']);
    expect(rows[1]!.slice(8, 11)).toEqual(['100', '0', '100']);
    expect(rows[2]![2]).toBe('李');
    expect(rows[2]!.slice(8, 12)).toEqual(['50.1', '1.75', '48.35', 'thanks, "pastor"']);
    expect(rows[3]![2]).toBe(`'=HYPERLINK("x")`);
    expect(rows[4]!.slice(0, 1)).toEqual(['Total']);
    expect(rows[4]!.slice(8, 12)).toEqual(['150.3', '1.75', '148.55', '3 offerings']);
  });

  it('handles an empty batch', () => {
    const rows = parseCsv(batchToCsv({ date: '2026-11-22', description: null, status: 'open', offerings: [] }));
    expect(rows[1]!.slice(8, 11)).toEqual(['0', '0', '0']);
  });
});

describe('batchCsvFilename', () => {
  it('includes the date and a safe description', () => {
    expect(batchCsvFilename({ date: '2026-11-22', description: 'Sunday / 主日' })).toBe('batch-2026-11-22-Sunday-主日.csv');
    expect(batchCsvFilename({ date: '2026-11-22', description: null })).toBe('batch-2026-11-22.csv');
  });
});
