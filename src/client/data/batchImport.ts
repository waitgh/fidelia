// Reads back the CSV written by lib/batchExport.ts (Batch → Export) and recreates the batch(es).
import { batches, categories, donors, offerings } from '../../db/schema';
import { PaymentMethodLabels } from '../../shared/types/enums';
import { calculateOfferingFee } from '../../shared/lib/offering-fees';
import type { AppDb } from './db';
import { DataError } from './session';

/** Normalized CSV header -> field. Accepts the export's own headers plus a few obvious variants. */
const HEADERS: Record<string, keyof RowFields> = {
  date: 'date', batchdate: 'date',
  description: 'description', batchdescription: 'description',
  donorlastname: 'lastName', lastname: 'lastName',
  donorfirstname: 'firstName', firstname: 'firstName',
  congregation: 'congregation',
  category: 'category', fund: 'category',
  designation: 'designation', designatedfor: 'designation',
  method: 'method', paymentmethod: 'method',
  check: 'checkNumber', checknumber: 'checkNumber', checkno: 'checkNumber',
  amount: 'amount',
  notes: 'notes', note: 'notes', memo: 'notes',
};
const REQUIRED: (keyof RowFields)[] = ['date', 'lastName', 'firstName', 'category', 'method', 'amount'];
const LABELS: Record<keyof RowFields, string> = {
  date: 'Date', description: 'Description', lastName: 'Donor Last Name', firstName: 'Donor First Name',
  congregation: 'Congregation', category: 'Category', designation: 'Designation', method: 'Method', checkNumber: 'Check #', amount: 'Amount', notes: 'Notes',
};

interface RowFields {
  date: string; description: string; lastName: string; firstName: string; congregation: string;
  category: string; designation: string; method: string; checkNumber: string; amount: string; notes: string;
}

export interface PlannedOffering {
  row: number;
  donorId: number | null; // null = a donor this import will add
  donorKey: string;
  donorName: string;
  categoryId: number;
  paymentMethod: string;
  amount: number;
  checkNumber: string | null;
  notes: string | null;
  designation: string | null;
}

export interface PlannedBatch {
  date: string;
  description: string | null;
  offerings: PlannedOffering[];
  total: number;
  /** An existing batch with the same date, description, count and total: probably imported already. */
  possibleDuplicateId: number | null;
}

export interface BatchImportPlan {
  batches: PlannedBatch[];
  newDonors: { key: string; firstName: string; lastName: string; congregation: string | null }[];
  errors: { row: number; message: string }[];
}

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const headerKey = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');
/** Undo the export's formula guard (a leading ' before = + - @). */
const unguard = (s: string) => (/^'[=+\-@\t\r]/.test(s) ? s.slice(1) : s);
const cents = (n: number) => Math.round(n * 100) / 100;

/** Accepts YYYY-MM-DD (as exported) and M/D/YYYY (what Excel may save it as). */
export function parseImportDate(s: string): string | null {
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  let y: number, mo: number, d: number;
  if (m) [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  else if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s))) [y, mo, d] = [Number(m[3]), Number(m[1]), Number(m[2])];
  else return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Checks the rows against this church's donors and categories without changing anything. */
export function planBatchImport(db: AppDb, rawRows: Record<string, string>[]): BatchImportPlan {
  const plan: BatchImportPlan = { batches: [], newDonors: [], errors: [] };
  if (rawRows.length === 0) {
    plan.errors.push({ row: 0, message: 'The file has no rows.' });
    return plan;
  }
  const present = new Set(Object.keys(rawRows[0]!).map((h) => HEADERS[headerKey(h)]).filter(Boolean));
  const missing = REQUIRED.filter((f) => !present.has(f));
  if (missing.length) {
    plan.errors.push({ row: 1, message: `Missing column(s): ${missing.map((f) => LABELS[f]).join(', ')}. Use a file made by Batch → Export.` });
    return plan;
  }

  const allDonors = db.select().from(donors).all();
  const donorsByName = new Map<string, typeof allDonors>();
  for (const d of allDonors) {
    const k = `${norm(d.lastName)}|${norm(d.firstName)}`;
    donorsByName.set(k, [...(donorsByName.get(k) ?? []), d]);
  }
  const catByName = new Map(db.select().from(categories).all().map((c) => [norm(c.name), c]));
  const methodByText = new Map<string, string>();
  for (const [value, label] of Object.entries(PaymentMethodLabels)) {
    methodByText.set(norm(value), value);
    methodByText.set(norm(label), value);
  }
  const existingBatches = db.select().from(batches).all();
  const existingOfferings = db.select({ batchId: offerings.batchId, amount: offerings.amount }).from(offerings).all();

  const groups = new Map<string, PlannedBatch>();
  const newDonors = new Map<string, BatchImportPlan['newDonors'][number]>();

  rawRows.forEach((raw, i) => {
    const row = i + 2; // spreadsheet row number (header is row 1)
    const f = {} as RowFields;
    for (const [h, v] of Object.entries(raw)) {
      const field = HEADERS[headerKey(h)];
      if (field && !f[field]) f[field] = unguard(v.trim());
    }
    if (/^total$/i.test(f.date ?? '')) return; // the export's summary row
    if (Object.values(f).every((v) => !v)) return; // blank line
    const err = (message: string) => plan.errors.push({ row, message });

    const date = parseImportDate(f.date ?? '');
    if (!date) return err(`Date "${f.date ?? ''}" is not a date (expected YYYY-MM-DD).`);
    if (!f.lastName || !f.firstName) return err('Donor first and last name are required.');
    const category = catByName.get(norm(f.category));
    if (!category) return err(`Category "${f.category ?? ''}" doesn't exist. Add it under Categories first.`);
    const paymentMethod = methodByText.get(norm(f.method));
    if (!paymentMethod) return err(`Method "${f.method ?? ''}" isn't one of: ${Object.values(PaymentMethodLabels).join(', ')}.`);
    const amount = Number((f.amount ?? '').replace(/[$,\s]/g, ''));
    if (!Number.isFinite(amount) || amount <= 0) return err(`Amount "${f.amount ?? ''}" must be a positive number.`);

    const donorName = `${f.firstName} ${f.lastName}`;
    const donorKey = `${norm(f.lastName)}|${norm(f.firstName)}`;
    let matches = donorsByName.get(donorKey) ?? [];
    if (matches.length > 1 && f.congregation) {
      const narrowed = matches.filter((d) => norm(d.congregation) === norm(f.congregation));
      if (narrowed.length) matches = narrowed;
    }
    if (matches.length > 1) {
      return err(`${matches.length} donors are named ${donorName}; can't tell which one. Give them distinct names or congregations, then import again.`);
    }
    const donorId = matches[0]?.id ?? null;
    if (donorId === null && !newDonors.has(donorKey)) {
      newDonors.set(donorKey, { key: donorKey, firstName: f.firstName, lastName: f.lastName, congregation: f.congregation || null });
    }

    const description = f.description || null;
    const gk = `${date}|${norm(description)}`;
    if (!groups.has(gk)) groups.set(gk, { date, description, offerings: [], total: 0, possibleDuplicateId: null });
    const g = groups.get(gk)!;
    g.offerings.push({
      row, donorId, donorKey, donorName, categoryId: category.id, paymentMethod, amount: cents(amount),
      checkNumber: f.checkNumber || null, notes: f.notes || null, designation: f.designation?.slice(0, 100) || null,
    });
    g.total = cents(g.total + amount);
  });

  for (const g of groups.values()) {
    const dup = existingBatches.find((b) => {
      if (b.date !== g.date || norm(b.description) !== norm(g.description)) return false;
      const os = existingOfferings.filter((o) => o.batchId === b.id);
      return os.length === g.offerings.length && cents(os.reduce((s, o) => s + o.amount, 0)) === g.total;
    });
    g.possibleDuplicateId = dup?.id ?? null;
  }
  plan.batches = [...groups.values()].sort((a, b) => a.date.localeCompare(b.date));
  plan.newDonors = [...newDonors.values()];
  return plan;
}

export interface BatchImportResult {
  batchIds: number[];
  offeringCount: number;
  donorsAdded: number;
}

/**
 * Creates one open batch per date/description in the file, adding any donors not found by name.
 * All or nothing: any row error and nothing is written. Fees are recalculated, not taken from the file.
 */
export function importBatches(db: AppDb, rawRows: Record<string, string>[]): BatchImportResult {
  const plan = planBatchImport(db, rawRows);
  if (plan.errors.length) {
    const first = plan.errors[0]!;
    throw new DataError(`Nothing imported: ${plan.errors.length} problem(s). ${first.row ? `Row ${first.row}: ` : ''}${first.message}`);
  }
  if (!plan.batches.length) throw new DataError('Nothing imported: the file has no offerings.');
  const catNames = new Map(db.select().from(categories).all().map((c) => [c.id, c.name]));
  const result: BatchImportResult = { batchIds: [], offeringCount: 0, donorsAdded: 0 };
  db.transaction((tx) => {
    const donorIds = new Map<string, number>();
    for (const d of plan.newDonors) {
      const created = tx.insert(donors).values({ firstName: d.firstName, lastName: d.lastName, congregation: d.congregation }).returning().get();
      donorIds.set(d.key, created.id);
      result.donorsAdded++;
    }
    for (const b of plan.batches) {
      const batch = tx.insert(batches).values({ date: b.date, description: b.description }).returning().get();
      result.batchIds.push(batch.id);
      for (const o of b.offerings) {
        tx.insert(offerings).values({
          batchId: batch.id,
          donorId: o.donorId ?? donorIds.get(o.donorKey)!,
          categoryId: o.categoryId,
          amount: o.amount,
          feeAmount: calculateOfferingFee(o.amount, o.paymentMethod, catNames.get(o.categoryId)),
          paymentMethod: o.paymentMethod,
          checkNumber: o.checkNumber,
          notes: o.notes,
          designation: o.designation,
        }).run();
        result.offeringCount++;
      }
    }
  });
  return result;
}
