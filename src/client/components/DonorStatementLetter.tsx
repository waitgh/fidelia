import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { FileText } from 'lucide-react';
import { formatCurrency, formatDate, paymentMethodLabel, todayISO } from '../lib/formatters.js';
import type { DonorStatement } from '../../shared/types/index.js';

export interface DonorLetterTemplate {
  headerImageUrl: string;
  signatureImageUrl: string;
  churchName: string;
  addressLine1: string;
  addressLine2: string;
  phone: string;
  bodyText: string;
  totalLabel: string;
  closingLine1: string;
  closingLine2: string;
}

/** html2pdf settings shared by Preview/Export and emailed statements. */
export function getStatementPdfOptions(filename: string) {
  return {
    margin: 10,
    filename,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['css', 'legacy'] },
  };
}

export async function loadHtml2Pdf(): Promise<any> {
  const mod = await import('html2pdf.js');
  const html2pdf = (mod as any).default ?? mod;
  if (typeof html2pdf !== 'function') throw new Error('PDF exporter failed to load');
  return html2pdf;
}

/**
 * Render a donor's statement letter off-screen and return it as a PDF blob.
 * Uses the same component as the on-screen report, so emailed PDFs match Export PDF.
 */
export async function renderStatementPdf(data: DonorStatement, template: DonorLetterTemplate, widthPx: number): Promise<Blob> {
  const html2pdf = await loadHtml2Pdf();
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-100000px;top:0;width:${widthPx}px;pointer-events:none;`;
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    flushSync(() => root.render(<DonorStatementReport data={data} template={template} id="statement-pdf-render" />));
    const el = host.firstElementChild as HTMLElement;
    await Promise.all(
      Array.from(el.querySelectorAll('img')).map((img) =>
        img.complete ? Promise.resolve() : new Promise<void>((resolve) => { img.onload = img.onerror = () => resolve(); }),
      ),
    );
    return (await html2pdf().set(getStatementPdfOptions('statement.pdf')).from(el).outputPdf('blob')) as Blob;
  } finally {
    root.unmount();
    host.remove();
  }
}

export function DonorStatementReport({ data, template, id = 'report-content' }: { data: DonorStatement; template: DonorLetterTemplate; id?: string }) {
  const recipientName = data.donor.spouseName
    ? `${data.donor.firstName} ${data.donor.lastName} & ${data.donor.spouseName}`
    : `${data.donor.firstName} ${data.donor.lastName}`;
  const periodYear = new Date(data.endDate).getFullYear();
  const bodyText = template.bodyText
    .replaceAll('{churchName}', template.churchName)
    .replaceAll('{endDate}', formatDate(data.endDate))
    .replaceAll('{year}', String(periodYear));

  return (
    <div className="card p-10 space-y-8" id={id}>
      {template.headerImageUrl && (
        <div className="flex justify-center">
          <img
            src={template.headerImageUrl}
            alt="Letterhead"
            className="max-h-28 object-contain"
            crossOrigin="anonymous"
          />
        </div>
      )}

      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-wide text-slate-700">{template.churchName}</h2>
          <p className="text-lg text-slate-600 mt-1">{template.addressLine1}</p>
          <p className="text-lg text-slate-600">{template.addressLine2}</p>
          <p className="text-lg text-slate-600">{template.phone}</p>
        </div>
        <div className="text-right text-lg text-slate-700 pt-2">{formatDate(todayISO())}</div>
      </div>

      <div className="space-y-1 text-lg text-slate-800">
        <p>{recipientName},</p>
        {data.donor.address && <p>{data.donor.address}</p>}
        {(data.donor.city || data.donor.state || data.donor.zipCode) && (
          <p>{[data.donor.city, data.donor.state].filter(Boolean).join(', ')} {data.donor.zipCode}</p>
        )}
      </div>

      <p className="text-xl leading-relaxed text-slate-800">{bodyText}</p>

      <p className="text-xl font-semibold text-slate-900">
        {template.totalLabel}: {formatCurrency(data.grandTotal)}
      </p>

      <div className="pt-10 text-xl text-slate-800 space-y-2">
        <p>{template.closingLine1}</p>
        {template.signatureImageUrl && (
          <img
            src={template.signatureImageUrl}
            alt="Signature"
            className="h-24 w-auto max-w-xs object-contain"
            crossOrigin="anonymous"
          />
        )}
        <p>{template.closingLine2}</p>
      </div>

      <div className="border-t border-gray-200 pt-6 report-details-page-break">
        <div className="flex items-center gap-2 mb-2">
          <FileText className="h-5 w-5 text-primary-600" />
          <h3 className="text-lg font-semibold">Contribution Details ({periodYear})</h3>
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Method</th>
                <th>Check #</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.offerings.map((o, i) => (
                <tr key={i}>
                  <td>{formatDate(o.date)}</td>
                  <td>{o.category}</td>
                  <td>
                    <span className="badge-gray">{paymentMethodLabel(o.paymentMethod)}</span>
                  </td>
                  <td className="font-mono text-gray-500">{o.checkNumber ?? '—'}</td>
                  <td className="text-right font-medium font-mono">{formatCurrency(o.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

