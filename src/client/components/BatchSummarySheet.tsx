import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { FundMethodTable } from './FundMethodTable.js';
import { getStatementPdfOptions, loadHtml2Pdf } from './DonorStatementLetter.js';
import type { FundMethodCell } from '../../shared/lib/fundMethodTable.js';
import { formatDate } from '../lib/formatters.js';

export interface BatchSummaryData {
  churchName: string;
  date: string;
  description: string | null;
  status: string;
  attendanceAdults: number | null;
  attendanceChildren: number | null;
  offerings: { categoryName: string; paymentMethod: string; amount: number; feeAmount: number | null; designation: string | null; checkNumber: string | null }[];
  methodOptions: { value: string; label: string }[];
}

export function batchFundMethodCells(offerings: BatchSummaryData['offerings']): FundMethodCell[] {
  return offerings.map((o) => ({
    categoryName: o.categoryName, paymentMethod: o.paymentMethod, designation: o.designation,
    totalAmount: o.amount, offeringCount: 1, feeAmount: o.feeAmount ?? 0,
  }));
}

/** One-page counting summary for a batch: replaces the paper summary sheet. */
export function BatchSummarySheet({ data }: { data: BatchSummaryData }) {
  const checks = data.offerings.filter((o) => o.paymentMethod === 'check').length;
  const hasAttendance = data.attendanceAdults != null || data.attendanceChildren != null;
  const attTotal = (data.attendanceAdults ?? 0) + (data.attendanceChildren ?? 0);
  const Stat = ({ label, value }: { label: string; value: string }) => (
    <div>
      <div className="text-xs uppercase tracking-wider text-gray-500">{label}</div>
      <div className="text-lg font-semibold text-gray-900 tabular-nums">{value}</div>
    </div>
  );

  return (
    <div className="bg-white p-10 text-gray-800 space-y-6">
      <div className="flex items-end justify-between border-b-2 border-gray-800 pb-3">
        <div>
          {data.churchName && <div className="text-sm text-gray-500">{data.churchName}</div>}
          <h1 className="text-2xl font-serif font-semibold">Offering Summary</h1>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold">{formatDate(data.date)}</div>
          {data.description && <div className="text-sm text-gray-600">{data.description}</div>}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Stat label="Adults" value={data.attendanceAdults != null ? String(data.attendanceAdults) : '—'} />
        <Stat label="Children" value={data.attendanceChildren != null ? String(data.attendanceChildren) : '—'} />
        <Stat label="Total attendance" value={hasAttendance ? String(attTotal) : '—'} />
        <Stat label="Checks" value={String(checks)} />
      </div>

      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <FundMethodTable cells={batchFundMethodCells(data.offerings)} methodOptions={data.methodOptions} />
      </div>

      <div className="grid grid-cols-2 gap-10 pt-16 text-sm">
        {['Counted by', 'Verified by'].map((l) => (
          <div key={l}>
            <div className="border-b border-gray-500 h-8" />
            <div className="mt-1 flex justify-between text-gray-500"><span>{l}</span><span>Date</span></div>
          </div>
        ))}
      </div>
      {data.status === 'open' && <p className="text-xs text-amber-700">Draft: this batch is still open, so these figures may change.</p>}
    </div>
  );
}

/** Renders the summary sheet off-screen and downloads it as a PDF. */
export async function downloadBatchSummaryPdf(data: BatchSummaryData): Promise<void> {
  const html2pdf = await loadHtml2Pdf();
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-100000px;top:0;width:800px;pointer-events:none;';
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    flushSync(() => root.render(<BatchSummarySheet data={data} />));
    const el = host.firstElementChild as HTMLElement;
    await html2pdf().set(getStatementPdfOptions(`summary-${data.date}.pdf`)).from(el).save();
  } finally {
    root.unmount();
    host.remove();
  }
}
