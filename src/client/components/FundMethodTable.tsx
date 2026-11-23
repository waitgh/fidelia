import { useMemo } from 'react';
import { buildFundMethodTable, type FundMethodCell, type FundMethodSums } from '../../shared/lib/fundMethodTable.js';
import { formatCurrency, paymentMethodLabel } from '../lib/formatters.js';
import { useSettings } from '../lib/settings.js';

/**
 * Funds down the side, payment methods across the top, with a subtotal for every fund and every method
 * (matches a counting sheet that lists cash and check separately). Methods with no gifts are left out.
 */
export function FundMethodTable({ cells, showFees = true }: { cells: FundMethodCell[]; showFees?: boolean }) {
  const { offeringMethodOptions } = useSettings();
  const t = useMemo(() => buildFundMethodTable(cells, offeringMethodOptions.map((m) => m.value)), [cells, offeringMethodOptions]);
  const label = (m: string) => offeringMethodOptions.find((o) => o.value === m)?.label ?? paymentMethodLabel(m);
  if (!t.rows.length) return <p className="px-6 py-4 text-sm text-gray-500">No offerings.</p>;
  const hasFees = showFees && t.totals.total.fees > 0;
  const money = (s: FundMethodSums | undefined) =>
    s && s.count ? formatCurrency(s.amount) : <span className="text-gray-300">—</span>;
  const cols = [...t.methods.map((m) => ({ key: m, sums: (r: Record<string, FundMethodSums>) => r[m] })), null];

  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>Fund</th>
            {t.methods.map((m) => <th key={m} className="text-right whitespace-nowrap">{label(m)}</th>)}
            <th className="text-right">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {t.rows.map((r) => (
            <tr key={r.categoryName}>
              <td className="font-medium">{r.categoryName}</td>
              {t.methods.map((m) => <td key={m} className="text-right font-mono whitespace-nowrap">{money(r.byMethod[m])}</td>)}
              <td className="text-right font-mono font-semibold whitespace-nowrap">{formatCurrency(r.total.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 border-gray-300">
          <tr className="font-semibold">
            <td>Total</td>
            {cols.map((c) => (
              <td key={c?.key ?? 'total'} className="text-right font-mono whitespace-nowrap">
                {formatCurrency((c ? c.sums(t.totals.byMethod) : t.totals.total)?.amount ?? 0)}
              </td>
            ))}
          </tr>
          <tr className="text-xs text-gray-500">
            <td>Number of gifts</td>
            {cols.map((c) => (
              <td key={c?.key ?? 'total'} className="text-right whitespace-nowrap">
                {(c ? c.sums(t.totals.byMethod) : t.totals.total)?.count ?? 0}
              </td>
            ))}
          </tr>
          {hasFees && (
            <>
              <tr className="text-sm">
                <td className="text-gray-500">Fees</td>
                {cols.map((c) => {
                  const fees = (c ? c.sums(t.totals.byMethod) : t.totals.total)?.fees ?? 0;
                  return <td key={c?.key ?? 'total'} className="text-right font-mono text-red-600 whitespace-nowrap">{fees ? `−${formatCurrency(fees)}` : ''}</td>;
                })}
              </tr>
              <tr className="text-sm font-medium">
                <td>Net</td>
                {cols.map((c) => {
                  const s = c ? c.sums(t.totals.byMethod) : t.totals.total;
                  return <td key={c?.key ?? 'total'} className="text-right font-mono whitespace-nowrap">{s ? formatCurrency(s.amount - s.fees) : ''}</td>;
                })}
              </tr>
            </>
          )}
        </tfoot>
      </table>
    </div>
  );
}
