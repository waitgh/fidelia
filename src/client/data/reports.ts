// Ported from the old server app: src/server/routes/reports.ts
import { and, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import { batches, categories, donors, offerings, pledges } from '../../db/schema';
import { isExcludedFromStatementTotal } from '../../shared/lib/statementTotals';
import type {
  DonorStatement,
  CategorySummary,
  PaymentMethodSummary,
  CongregationSummary,
  CongregationBreakdown,
  CongregationDonorRow,
  CongregationOfferingRow,
  TrendPeriod,
  TrendsReport,
  TrendPeriodRow,
  TrendCategoryRow,
  TrendCongregationRow,
} from '../../shared/types/index';
import type { SelectedFields } from 'drizzle-orm/sqlite-core';
import type { AppDb } from './db';
import { DataError } from './session';

export function donorStatement(db: AppDb, donorId: number, startDate: string, endDate: string): DonorStatement {
  if (!donorId || !startDate || !endDate) throw new DataError('donorId, startDate, and endDate are required');
  const donor = db.select().from(donors).where(eq(donors.id, Number(donorId))).get();
  if (!donor) throw new DataError('Donor not found', 404);

  const rows = db
    .select({
      date: batches.date,
      category: categories.name,
      amount: offerings.amount,
      paymentMethod: offerings.paymentMethod,
      checkNumber: offerings.checkNumber,
    })
    .from(offerings)
    .innerJoin(batches, eq(offerings.batchId, batches.id))
    .innerJoin(categories, eq(offerings.categoryId, categories.id))
    .where(and(eq(offerings.donorId, Number(donorId)), gte(batches.date, startDate), lte(batches.date, endDate)))
    .orderBy(batches.date)
    .all();

  const totalsByCategory: Record<string, number> = {};
  for (const o of rows) totalsByCategory[o.category] = (totalsByCategory[o.category] ?? 0) + o.amount;
  const grandTotal = rows.reduce((s, o) => (isExcludedFromStatementTotal(o) ? s : s + o.amount), 0);

  const donorPledges = db
    .select({ category: categories.name, pledgedAmount: pledges.amount })
    .from(pledges)
    .innerJoin(categories, eq(pledges.categoryId, categories.id))
    .where(and(eq(pledges.donorId, Number(donorId)), lte(pledges.startDate, endDate), gte(pledges.endDate, startDate)))
    .all();

  return {
    donor: {
      id: donor.id,
      firstName: donor.firstName,
      lastName: donor.lastName,
      spouseName: donor.spouseName,
      email: donor.email,
      phone: donor.phone,
      address: donor.address,
      city: donor.city,
      state: donor.state,
      zipCode: donor.zipCode,
      envelopeNumber: donor.envelopeNumber,
    },
    startDate,
    endDate,
    offerings: rows,
    totalsByCategory,
    grandTotal,
    pledges: donorPledges.map((p) => {
      const givenAmount = totalsByCategory[p.category] ?? 0;
      return {
        category: p.category,
        pledgedAmount: p.pledgedAmount,
        givenAmount,
        fulfillmentPct: p.pledgedAmount > 0 ? Math.round((givenAmount / p.pledgedAmount) * 100) : 0,
      };
    }),
  };
}

const SUM = sql<number>`coalesce(sum(${offerings.amount}), 0)`;
const COUNT = sql<number>`count(${offerings.id})`;
const BY_SUM_DESC = desc(sql`sum(${offerings.amount})`);

export function congregationSummary(
  db: AppDb,
  startDate: string,
  endDate: string,
  congregation?: string,
): CongregationSummary {
  if (!startDate || !endDate) throw new DataError('startDate and endDate are required');
  const dateFilter = and(gte(batches.date, startDate), lte(batches.date, endDate));
  const congFilter = congregation
    ? congregation === '__none__'
      ? isNull(donors.congregation)
      : eq(donors.congregation, congregation)
    : undefined;
  const baseFilter = congFilter ? and(dateFilter, congFilter) : dateFilter;

  // offerings ⋈ batches ⋈ donors ⋈ categories, the base for every query below
  // (categories is an inner join on a NOT NULL FK, so it never drops rows).
  // Typed loosely (drizzle can't chain joins on a generic selection); callers annotate results.
  const from = (fields: SelectedFields): any =>
    (db.select(fields as Record<string, any>) as any)
      .from(offerings)
      .innerJoin(batches, eq(offerings.batchId, batches.id))
      .innerJoin(donors, eq(offerings.donorId, donors.id))
      .innerJoin(categories, eq(offerings.categoryId, categories.id));

  const categorySummary = (where: ReturnType<typeof and>): CategorySummary[] =>
    from({ categoryId: categories.id, categoryName: categories.name, totalAmount: SUM, offeringCount: COUNT })
      .where(where)
      .groupBy(categories.id)
      .orderBy(BY_SUM_DESC)
      .all();

  const methodSummary = (where: ReturnType<typeof and>): PaymentMethodSummary[] =>
    from({ paymentMethod: offerings.paymentMethod, totalAmount: SUM, offeringCount: COUNT })
      .where(where)
      .groupBy(offerings.paymentMethod)
      .orderBy(BY_SUM_DESC)
      .all();

  const congRows: { congregation: string | null; totalAmount: number; offeringCount: number; donorCount: number }[] = from({
    congregation: donors.congregation,
    totalAmount: SUM,
    offeringCount: COUNT,
    donorCount: sql<number>`count(distinct ${offerings.donorId})`,
  })
    .where(baseFilter)
    .groupBy(donors.congregation)
    .orderBy(BY_SUM_DESC)
    .all();

  const congregations: CongregationBreakdown[] = congRows.map((row) => {
    const where = and(dateFilter, row.congregation ? eq(donors.congregation, row.congregation) : isNull(donors.congregation));
    const donorRows: CongregationDonorRow[] = from({
      donorId: donors.id,
      firstName: donors.firstName,
      lastName: donors.lastName,
      envelopeNumber: donors.envelopeNumber,
      totalAmount: SUM,
      offeringCount: COUNT,
    })
      .where(where)
      .groupBy(donors.id)
      .orderBy(BY_SUM_DESC)
      .all();
    const offeringDetails: CongregationOfferingRow[] = from({
      offeringId: offerings.id,
      date: batches.date,
      donorId: donors.id,
      firstName: donors.firstName,
      lastName: donors.lastName,
      envelopeNumber: donors.envelopeNumber,
      categoryName: categories.name,
      amount: offerings.amount,
      paymentMethod: offerings.paymentMethod,
      checkNumber: offerings.checkNumber,
    })
      .where(where)
      .orderBy(donors.lastName, donors.firstName, batches.date)
      .all();
    return {
      congregation: row.congregation ?? 'Unassigned',
      totalAmount: row.totalAmount,
      offeringCount: row.offeringCount,
      donorCount: row.donorCount,
      categories: categorySummary(where),
      paymentMethods: methodSummary(where),
      donors: donorRows,
      offeringDetails,
    };
  });

  const totals: { grandTotal: number; totalOfferings: number; uniqueDonors: number } | undefined = from({
    grandTotal: SUM,
    totalOfferings: COUNT,
    uniqueDonors: sql<number>`count(distinct ${offerings.donorId})`,
  })
    .where(baseFilter)
    .get();

  return {
    startDate,
    endDate,
    congregation: congregation || null,
    categories: categorySummary(baseFilter),
    paymentMethods: methodSummary(baseFilter),
    congregations,
    grandTotal: totals?.grandTotal ?? 0,
    totalOfferings: totals?.totalOfferings ?? 0,
    uniqueDonors: totals?.uniqueDonors ?? 0,
  };
}

export function dashboard(db: AppDb, now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const totalBetween = (start: string, end: string) =>
    db
      .select({ total: SUM, count: COUNT })
      .from(offerings)
      .innerJoin(batches, eq(offerings.batchId, batches.id))
      .where(and(gte(batches.date, start), lte(batches.date, end)))
      .get();
  const yearly = totalBetween(`${year}-01-01`, `${year}-12-31`);
  const monthly = totalBetween(`${year}-${month}-01`, `${year}-${month}-31`);
  const activeDonors = db.select({ count: sql<number>`count(*)` }).from(donors).where(eq(donors.isActive, true)).get();
  const recentBatches = db
    .select({
      id: batches.id,
      date: batches.date,
      description: batches.description,
      status: batches.status,
      totalAmount: SUM,
      offeringCount: COUNT,
    })
    .from(batches)
    .leftJoin(offerings, eq(batches.id, offerings.batchId))
    .groupBy(batches.id)
    .orderBy(desc(batches.date))
    .limit(5)
    .all();
  const categoryBreakdown = db
    .select({ categoryName: categories.name, totalAmount: SUM })
    .from(offerings)
    .innerJoin(batches, eq(offerings.batchId, batches.id))
    .innerJoin(categories, eq(offerings.categoryId, categories.id))
    .where(and(gte(batches.date, `${year}-01-01`), lte(batches.date, `${year}-12-31`)))
    .groupBy(categories.id)
    .orderBy(BY_SUM_DESC)
    .all();
  return {
    yearlyTotal: yearly?.total ?? 0,
    yearlyCount: yearly?.count ?? 0,
    monthlyTotal: monthly?.total ?? 0,
    monthlyCount: monthly?.count ?? 0,
    activeDonorCount: activeDonors?.count ?? 0,
    recentBatches,
    categoryBreakdown,
  };
}

export function formatPeriodLabel(key: string, p: TrendPeriod): string {
  if (p === 'yearly') return key;
  if (p === 'quarterly') return key.replace('-Q', ' Q');
  if (p === 'weekly') {
    const [year, week] = key.split('-W');
    const jan4 = new Date(Number(year), 0, 4);
    const monday = new Date(jan4);
    monday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (Number(week) - 1) * 7);
    return `Wk of ${monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }
  const [year, month] = key.split('-');
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function rankNames(rows: { name: string; total: number }[]): string[] {
  const t: Record<string, number> = {};
  for (const r of rows) t[r.name] = (t[r.name] ?? 0) + r.total;
  return Object.entries(t).sort((a, b) => b[1] - a[1]).map(([n]) => n);
}

export function trends(
  db: AppDb,
  period: TrendPeriod = 'monthly',
  startDate: string,
  endDate: string,
  congregation?: string,
): TrendsReport {
  if (!startDate || !endDate) throw new DataError('startDate and endDate are required');
  if (!['weekly', 'monthly', 'quarterly', 'yearly'].includes(period)) {
    throw new DataError('period must be weekly, monthly, quarterly, or yearly');
  }
  const p = period;
  const periodExpr =
    p === 'weekly'
      ? sql<string>`strftime('%Y-W%W', ${batches.date})`
      : p === 'monthly'
        ? sql<string>`strftime('%Y-%m', ${batches.date})`
        : p === 'quarterly'
          ? sql<string>`(strftime('%Y', ${batches.date}) || '-Q' || ((cast(strftime('%m', ${batches.date}) as integer) + 2) / 3))`
          : sql<string>`strftime('%Y', ${batches.date})`;
  const dateFilter = and(gte(batches.date, startDate), lte(batches.date, endDate));
  const congFilter = congregation
    ? congregation === '__none__'
      ? isNull(donors.congregation)
      : eq(donors.congregation, congregation)
    : undefined;
  const where = congFilter ? and(dateFilter, congFilter) : dateFilter;
  const donorCount = sql<number>`count(distinct ${offerings.donorId})`;

  const totals: TrendPeriodRow[] = db
    .select({ periodKey: periodExpr, totalAmount: SUM, offeringCount: COUNT, donorCount })
    .from(offerings)
    .innerJoin(batches, eq(offerings.batchId, batches.id))
    .innerJoin(donors, eq(offerings.donorId, donors.id))
    .where(where)
    .groupBy(periodExpr)
    .orderBy(periodExpr)
    .all()
    .map((r) => ({ ...r, period: formatPeriodLabel(r.periodKey, p) }));

  const byCategory: TrendCategoryRow[] = db
    .select({ periodKey: periodExpr, categoryId: categories.id, categoryName: categories.name, totalAmount: SUM })
    .from(offerings)
    .innerJoin(batches, eq(offerings.batchId, batches.id))
    .innerJoin(categories, eq(offerings.categoryId, categories.id))
    .innerJoin(donors, eq(offerings.donorId, donors.id))
    .where(where)
    .groupBy(periodExpr, categories.id)
    .orderBy(periodExpr)
    .all()
    .map((r) => ({ ...r, period: formatPeriodLabel(r.periodKey, p) }));

  const byCongregation: TrendCongregationRow[] = db
    .select({ periodKey: periodExpr, congregation: donors.congregation, totalAmount: SUM, donorCount })
    .from(offerings)
    .innerJoin(batches, eq(offerings.batchId, batches.id))
    .innerJoin(donors, eq(offerings.donorId, donors.id))
    .where(where)
    .groupBy(periodExpr, donors.congregation)
    .orderBy(periodExpr)
    .all()
    .map((r) => ({ ...r, congregation: r.congregation ?? 'Unassigned', period: formatPeriodLabel(r.periodKey, p) }));

  return {
    period: p,
    startDate,
    endDate,
    totals,
    byCategory,
    byCongregation,
    categoryNames: rankNames(byCategory.map((r) => ({ name: r.categoryName, total: r.totalAmount }))),
    congregationNames: rankNames(byCongregation.map((r) => ({ name: r.congregation, total: r.totalAmount }))),
  };
}
