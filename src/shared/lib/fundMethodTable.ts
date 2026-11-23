/** One (fund, payment method) group: what the database or a batch's offerings add up to. */
export interface FundMethodCell {
  categoryName: string;
  paymentMethod: string;
  totalAmount: number;
  offeringCount: number;
  feeAmount: number;
  /** Who the gifts were designated for within the fund; null/'' = undesignated. */
  designation?: string | null;
}

export interface FundMethodSums {
  amount: number;
  count: number;
  fees: number;
}

export interface FundMethodTable {
  /** Payment methods with at least one offering, in the configured order (unknown ones last, A–Z). */
  methods: string[];
  rows: {
    categoryName: string;
    byMethod: Record<string, FundMethodSums>;
    total: FundMethodSums;
    /** Only when the fund has designated gifts: one entry per designation (A–Z), then "Undesignated" if any. */
    designations: { name: string; undesignated: boolean; byMethod: Record<string, FundMethodSums>; total: FundMethodSums }[];
  }[];
  totals: { byMethod: Record<string, FundMethodSums>; total: FundMethodSums };
}

/** Funds listed first, in this order; the rest follow A–Z. */
const FUND_ORDER = ['general', 'building', 'mission'];

const rank = (order: string[], key: string) => {
  const i = order.indexOf(key);
  return i === -1 ? order.length : i;
};

export function sortFunds(a: string, b: string): number {
  return rank(FUND_ORDER, a.trim().toLowerCase()) - rank(FUND_ORDER, b.trim().toLowerCase()) || a.localeCompare(b);
}

/**
 * Crosses funds (rows) with payment methods (columns), with subtotals both ways.
 * Sums in whole cents so totals match the per-offering amounts exactly.
 */
export function buildFundMethodTable(cells: FundMethodCell[], methodOrder: string[]): FundMethodTable {
  const c = (n: number) => Math.round(n * 100);
  const zero = () => ({ amount: 0, count: 0, fees: 0 });
  const add = (s: FundMethodSums, cell: FundMethodCell) => {
    s.amount += c(cell.totalAmount);
    s.count += cell.offeringCount;
    s.fees += c(cell.feeAmount);
  };
  const toDollars = (s: FundMethodSums): FundMethodSums => ({ amount: s.amount / 100, count: s.count, fees: s.fees / 100 });

  type Acc = { byMethod: Record<string, FundMethodSums>; total: FundMethodSums };
  const rowMap = new Map<string, Acc & { des: Map<string, Acc> }>();
  const colTotals: Record<string, FundMethodSums> = {};
  const grand = zero();
  for (const cell of cells) {
    if (!cell.offeringCount) continue;
    let row = rowMap.get(cell.categoryName);
    if (!row) rowMap.set(cell.categoryName, (row = { byMethod: {}, total: zero(), des: new Map() }));
    add((row.byMethod[cell.paymentMethod] ??= zero()), cell);
    add(row.total, cell);
    const dk = cell.designation?.trim() ?? '';
    let d = row.des.get(dk);
    if (!d) row.des.set(dk, (d = { byMethod: {}, total: zero() }));
    add((d.byMethod[cell.paymentMethod] ??= zero()), cell);
    add(d.total, cell);
    add((colTotals[cell.paymentMethod] ??= zero()), cell);
    add(grand, cell);
  }

  const methods = Object.keys(colTotals).sort((a, b) => rank(methodOrder, a) - rank(methodOrder, b) || a.localeCompare(b));
  const mapSums = (r: Record<string, FundMethodSums>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, toDollars(v)]));
  return {
    methods,
    rows: [...rowMap.entries()]
      .sort(([a], [b]) => sortFunds(a, b))
      .map(([categoryName, r]) => {
        const hasDesignated = [...r.des.keys()].some((k) => k !== '');
        const designations = hasDesignated
          ? [...r.des.entries()]
              .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)))
              .map(([name, d]) => ({ name: name || 'Undesignated', undesignated: name === '', byMethod: mapSums(d.byMethod), total: toDollars(d.total) }))
          : [];
        return { categoryName, byMethod: mapSums(r.byMethod), total: toDollars(r.total), designations };
      }),
    totals: { byMethod: mapSums(colTotals), total: toDollars(grand) },
  };
}
