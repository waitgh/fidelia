// Ported from the old server app: src/server/routes/statementEmails.ts (data parts).
// Sending itself happens in src/client/mail via the treasurer's own account.
import { and, eq, gte, lte } from 'drizzle-orm';
import { batches, categories, donors, offerings, statementEmails } from '../../db/schema';
import { isExcludedFromStatementTotal } from '../../shared/lib/statementTotals';
import type { StatementEmailRecipient, StatementEmailStatus } from '../../shared/types/index';
import type { AppDb } from './db';
import { DataError } from './session';

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A donor's email field may hold several addresses separated by ; , or / */
export function parseEmails(raw: string | null | undefined): string[] {
  return (raw ?? '').split(/[;,/]/).map((e) => e.trim()).filter((e) => EMAIL_RE.test(e));
}

export function listRecipients(db: AppDb, startDate: string, endDate: string): StatementEmailRecipient[] {
  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) {
    throw new DataError('startDate and endDate (YYYY-MM-DD) are required');
  }
  const rows = db
    .select({ donorId: offerings.donorId, amount: offerings.amount, paymentMethod: offerings.paymentMethod, category: categories.name })
    .from(offerings)
    .innerJoin(batches, eq(offerings.batchId, batches.id))
    .innerJoin(categories, eq(offerings.categoryId, categories.id))
    .where(and(gte(batches.date, startDate), lte(batches.date, endDate)))
    .all();
  const totals = new Map<number, number>();
  for (const r of rows) totals.set(r.donorId, (totals.get(r.donorId) ?? 0) + (isExcludedFromStatementTotal(r) ? 0 : r.amount));

  const attempts = db
    .select()
    .from(statementEmails)
    .where(and(eq(statementEmails.periodStart, startDate), eq(statementEmails.periodEnd, endDate)))
    .orderBy(statementEmails.id)
    .all();
  const latest = new Map<number, (typeof attempts)[number]>();
  const everSent = new Map<number, string>();
  for (const a of attempts) {
    latest.set(a.donorId, a);
    if (a.status === 'sent') everSent.set(a.donorId, a.createdAt);
  }

  return db
    .select()
    .from(donors)
    .all()
    .filter((d) => totals.has(d.id))
    .map((d) => {
      const last = latest.get(d.id);
      const sentAt = everSent.get(d.id) ?? null;
      let status: StatementEmailStatus = 'not_sent';
      if (sentAt) status = 'sent';
      else if (last?.status === 'failed') status = 'failed';
      else if (last?.status === 'dry_run') status = 'dry_run';
      return {
        donorId: d.id,
        name: d.spouseName ? `${d.firstName} ${d.lastName} & ${d.spouseName}`.trim() : `${d.firstName} ${d.lastName}`.trim(),
        sortName: `${d.lastName}, ${d.firstName}`.trim().toLowerCase(),
        email: d.email ?? '',
        validEmails: parseEmails(d.email),
        total: Math.round((totals.get(d.id) ?? 0) * 100) / 100,
        status,
        sentAt,
        lastError: status === 'failed' ? (last?.error ?? null) : null,
      };
    })
    .sort((a, b) => a.sortName.localeCompare(b.sortName))
    .map(({ sortName: _s, ...r }) => r);
}

export interface SendRequest {
  donorId: number;
  startDate: string;
  endDate: string;
  subject: string;
  body: string;
  pdfBase64: string;
  filename: string;
  testTo?: string;
}

/** Validates a send request and resolves recipients. Throws DataError on bad input. */
export function prepareSend(db: AppDb, req: SendRequest) {
  const { donorId, startDate, endDate, subject, body, pdfBase64, filename, testTo } = req;
  if (!Number.isInteger(donorId) || !DATE_RE.test(startDate ?? '') || !DATE_RE.test(endDate ?? '')) {
    throw new DataError('donorId, startDate and endDate are required');
  }
  if (typeof subject !== 'string' || !subject.trim() || typeof body !== 'string' || !pdfBase64) {
    throw new DataError('subject, body and pdfBase64 are required');
  }
  const donor = db.select().from(donors).where(eq(donors.id, donorId)).get();
  if (!donor) throw new DataError('Donor not found', 404);
  const isTest = typeof testTo === 'string' && testTo.trim() !== '';
  const to = isTest ? parseEmails(testTo) : parseEmails(donor.email);
  if (!to.length) throw new DataError(isTest ? 'Enter a valid test email address' : 'Donor has no valid email address');
  return {
    isTest,
    to,
    subject: isTest ? `[TEST] ${subject}` : subject,
    filename: /^[\w .()-]+\.pdf$/i.test(filename ?? '') ? filename : 'Contribution Statement.pdf',
  };
}

export function recordAttempt(
  db: AppDb,
  a: { donorId: number; startDate: string; endDate: string; to: string[]; status: 'sent' | 'dry_run' | 'failed'; error?: string; sentBy: string },
) {
  db.insert(statementEmails)
    .values({
      donorId: a.donorId,
      periodStart: a.startDate,
      periodEnd: a.endDate,
      email: a.to.join('; '),
      status: a.status,
      error: a.error ?? null,
      sentBy: a.sentBy,
    })
    .run();
}
