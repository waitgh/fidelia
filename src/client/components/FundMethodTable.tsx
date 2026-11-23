import { Fragment, useMemo } from 'react';
import { buildFundMethodTable, type FundMethodCell, type FundMethodSums } from '../../shared/lib/fundMethodTable.js';
import { formatCurrency, paymentMethodLabel } from '../lib/formatters.js';
import { useSettings } from '../lib/settings.js';

const plain = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Own styles rather than .table-container's, whose `th { text-left }` outranks text-right.
const TH = 'px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider align-bottom';
const NUM = 'px-3 py-2 text-right whitespace-nowrap tabular-nums w-px min-w-[6.5rem]';
const TOTAL_COL = 'bg-gray-50 border-l border-gray-200';

/**
 * Funds down the side, payment methods across the top, with a subtotal for every fund and every method
 * (matches a counting sheet that lists cash and check separately). Methods with no gifts are left out.
 */
export function FundMethodTable({ cells, showFees = true, methodOptions }: {
  cells: FundMethodCell[];
  showFees?: boolean;
  /** Overrides the Settings context (for off-screen PDF rendering, which has no provider). */
  methodOptions?: { value: string; label: string }[];
}) {
  const settings = useSettings();
  const offeringMethodOptions = methodOptions ?? settings.offeringMethodOptions;
  const t = useMemo(() => buildFundMethodTable(cells, offeringMethodOptions.map((m) => m.value)), [cells, offeringMethodOptions]);
  const label = (m: string) => offeringMethodOptions.find((o) => o.value === m)?.label ?? paymentMethodLabel(m);
  if (!t.rows.length) return <p className="px-6 py-4 text-sm text-gray-500">No offerings.</p>;

  const hasFees = showFees && t.totals.total.fees > 0;
  const cols: { key: string; label: string; sums: FundMethodSums; total?: boolean }[] = [
    ...t.methods.map((m) => ({ key: m, label: label(m), sums: t.totals.byMethod[m]! })),
    { key: '__total', label: 'Total', sums: t.totals.total, total: true },
  ];
  const gifts = (n: number) => `${n} gift${n === 1 ? '' : 's'}`;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-gray-700">
        <thead className="border-b border-gray-200">
          <tr>
            <th className={`${TH} text-left pl-6`}>Fund</th>
            {cols.map((c) => (
              <th key={c.key} className={`${TH} text-right whitespace-nowrap ${c.total ? TOTAL_COL : ''} ${c.total ? 'pr-6' : ''}`}>
                <div>{c.label}</div>
                <div className="mt-0.5 font-normal normal-case tracking-normal text-gray-400">{gifts(c.sums.count)}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {t.rows.map((r) => (
            <Fragment key={r.categoryName}>
              <tr>
                <td className="pl-6 pr-3 py-2 font-medium text-gray-900">{r.categoryName}</td>
                {t.methods.map((m) => (
                  <td key={m} className={NUM}>{r.byMethod[m]?.count ? plain.format(r.byMethod[m]!.amount) : ''}</td>
                ))}
                <td className={`${NUM} ${TOTAL_COL} pr-6 font-semibold text-gray-900`}>{plain.format(r.total.amount)}</td>
              </tr>
              {r.designations.map((d) => (
                <tr key={d.name} className="!border-t-0 text-xs text-gray-500">
                  <td className={`pl-10 pr-3 py-1 ${d.undesignated ? 'italic' : ''}`}>{d.name}</td>
                  {t.methods.map((m) => (
                    <td key={m} className={`${NUM} py-1`}>{d.byMethod[m]?.count ? plain.format(d.byMethod[m]!.amount) : ''}</td>
                  ))}
                  <td className={`${NUM} ${TOTAL_COL} py-1 pr-6`}>{plain.format(d.total.amount)}</td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gray-300 font-semibold text-gray-900">
            <td className="pl-6 pr-3 py-2.5">Total</td>
            {cols.map((c) => (
              <td key={c.key} className={`${NUM} py-2.5 ${c.total ? `${TOTAL_COL} pr-6` : ''}`}>{formatCurrency(c.sums.amount)}</td>
            ))}
          </tr>
          {hasFees && (
            <>
              <tr className="text-xs text-gray-500">
                <td className="pl-6 pr-3 py-1">Fees</td>
                {cols.map((c) => (
                  <td key={c.key} className={`${NUM} py-1 text-red-600 ${c.total ? `${TOTAL_COL} pr-6` : ''}`}>
                    {c.sums.fees ? `−${plain.format(c.sums.fees)}` : ''}
                  </td>
                ))}
              </tr>
              <tr className="text-xs text-gray-600 font-medium">
                <td className="pl-6 pr-3 pt-1 pb-2.5">Net</td>
                {cols.map((c) => (
                  <td key={c.key} className={`${NUM} pt-1 pb-2.5 ${c.total ? `${TOTAL_COL} pr-6` : ''}`}>
                    {formatCurrency(c.sums.amount - c.sums.fees)}
                  </td>
                ))}
              </tr>
            </>
          )}
        </tfoot>
      </table>
    </div>
  );
}
