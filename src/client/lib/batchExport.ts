import { toCsv } from './csv.js';
import { paymentMethodLabel } from './formatters.js';

export interface BatchExportInput {
  date: string;
  description: string | null;
  status: string;
  offerings: {
    donorFirstName: string;
    donorLastName: string;
    donorCongregation: string | null;
    categoryName: string;
    amount: number;
    feeAmount: number | null;
    paymentMethod: string;
    checkNumber: string | null;
    notes: string | null;
  }[];
}

const money = (n: number) => Math.round(n * 100) / 100;

/**
 * One row per offering, followed by a Total row. Amounts are plain numbers so spreadsheets can sum them.
 * `data/batchImport.ts` reads this format back, so keep the two in step.
 */
export function batchToCsv(batch: BatchExportInput): string {
  const header = ['Date', 'Description', 'Donor Last Name', 'Donor First Name', 'Congregation', 'Category', 'Method', 'Check #', 'Amount', 'Fee', 'Net', 'Notes'];
  let gross = 0;
  let fees = 0;
  const rows = batch.offerings.map((o) => {
    const fee = o.feeAmount ?? 0;
    gross += o.amount;
    fees += fee;
    return [
      batch.date,
      batch.description,
      o.donorLastName,
      o.donorFirstName,
      o.donorCongregation,
      o.categoryName,
      paymentMethodLabel(o.paymentMethod),
      o.checkNumber,
      money(o.amount),
      money(fee),
      money(o.amount - fee),
      o.notes,
    ];
  });
  const total = ['Total', '', '', '', '', '', '', '', money(gross), money(fees), money(gross - fees), `${batch.offerings.length} offerings`];
  return toCsv([header, ...rows, total]);
}

export function batchCsvFilename(batch: Pick<BatchExportInput, 'date' | 'description'>): string {
  const slug = (batch.description ?? '').trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 40);
  return `batch-${batch.date}${slug ? `-${slug}` : ''}.csv`;
}
