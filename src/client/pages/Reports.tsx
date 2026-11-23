import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api.js';
import { formatCurrency, formatDate, paymentMethodLabel, yearStartISO, todayISO } from '../lib/formatters.js';
import { Mail, Calendar, Church, ChevronDown, ChevronUp, Download, Eye, TrendingUp } from 'lucide-react';
import type { DonorStatement, CongregationSummary, TrendsReport } from '../../shared/types/index.js';
import { useSettings } from '../lib/settings.js';
import { FundMethodTable } from '../components/FundMethodTable.js';
import { useAuth } from '../lib/auth.js';
import { DonorPicker } from '../components/DonorPicker.js';
import { EmailStatements } from '../components/EmailStatements.js';
import { DonorStatementReport, getStatementPdfOptions, loadHtml2Pdf, type DonorLetterTemplate } from '../components/DonorStatementLetter.js';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

type ReportType = 'summary' | 'donor-statement' | 'trends';
/** Legacy per-browser storage; migrated into the shared `donorLetterTemplate` setting on first load. */
const LEGACY_TEMPLATE_KEY = 'donor_letter_template_v1';


const STATIC_TEMPLATE_DEFAULTS = {
  headerImageUrl: '',
  signatureImageUrl: '',
  bodyText:
    'Listed below is the record of your cash contributions to {churchName} for the period ended {endDate}. Please keep this record for your tax returns. No food, service offerings, or stock/mutual fund offerings are included in the contributions.',
  totalLabel: 'Total Contributions',
  closingLine1: 'Blessings,',
};

interface DonorOption {
  id: number;
  firstName: string;
  lastName: string;
  spouseName: string | null;
  envelopeNumber: string | null;
}

/** Read an image file and downscale it so the data URL stays small enough to store in the template. */
/** Bounding box of the non-blank pixels (not transparent, not near-white), with a little padding. */
function findContentBox(img: HTMLImageElement) {
  const fullW = img.naturalWidth;
  const fullH = img.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = fullW;
  canvas.height = fullH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { sx: 0, sy: 0, sw: fullW, sh: fullH };
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, fullW, fullH).data;
  let minX = fullW, minY = fullH, maxX = -1, maxY = -1;
  for (let y = 0; y < fullH; y++) {
    for (let x = 0; x < fullW; x++) {
      const i = (y * fullW + x) * 4;
      const r = data[i] ?? 0, g = data[i + 1] ?? 0, b = data[i + 2] ?? 0, a = data[i + 3] ?? 0;
      const blank = a < 16 || (r > 240 && g > 240 && b > 240);
      if (!blank) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { sx: 0, sy: 0, sw: fullW, sh: fullH };
  const pad = Math.round(Math.max(maxX - minX, maxY - minY) * 0.03);
  const sx = Math.max(0, minX - pad);
  const sy = Math.max(0, minY - pad);
  return { sx, sy, sw: Math.min(fullW, maxX + pad + 1) - sx, sh: Math.min(fullH, maxY + pad + 1) - sy };
}

function resizeImageToDataUrl(file: File, maxWidth: number, maxHeight: number, trim = false): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const { sx, sy, sw, sh } = trim
        ? findContentBox(img)
        : { sx: 0, sy: 0, sw: img.naturalWidth, sh: img.naturalHeight };
      const scale = Math.min(1, maxWidth / sw, maxHeight / sh);
      const w = Math.max(1, Math.round(sw * scale));
      const h = Math.max(1, Math.round(sh * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas unavailable'));
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
      // PNG keeps transparency for logos; fall back to JPEG if it is still large.
      let out = canvas.toDataURL('image/png');
      if (out.length > 1_000_000) {
        ctx.globalCompositeOperation = 'destination-over';
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        out = canvas.toDataURL('image/jpeg', 0.9);
      }
      resolve(out);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Invalid image'));
    };
    img.src = objectUrl;
  });
}

interface ImageDropFieldProps {
  value: string;
  onChange: (dataUrl: string) => void;
  onError: (message: string) => void;
  maxWidth: number;
  maxHeight: number;
  placeholder: string;
  previewClassName: string;
  /** Crop away blank margins around the content (useful for signatures). */
  trim?: boolean;
}

/** Drag-and-drop (or click-to-browse) image picker that stores the image as a downscaled data URL. */
function ImageDropField({ value, onChange, onError, maxWidth, maxHeight, placeholder, previewClassName, trim = false }: ImageDropFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const loadFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      onError('Please choose an image file.');
      return;
    }
    try {
      onError('');
      onChange(await resizeImageToDataUrl(file, maxWidth, maxHeight, trim));
    } catch {
      onError('Could not read that image. Try a PNG or JPEG file.');
    }
  };

  return (
    <>
      <div
        className={`mt-2 rounded-lg border-2 border-dashed p-3 flex justify-center items-center min-h-[6rem] cursor-pointer transition-colors ${
          dragOver ? 'border-primary-500 bg-primary-50' : 'border-gray-200 bg-gray-50 hover:border-gray-300'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); loadFile(e.dataTransfer.files?.[0]); }}
        onClick={() => inputRef.current?.click()}
      >
        {value ? (
          <img src={value} alt="Preview" className={`${previewClassName} object-contain`} />
        ) : (
          <p className="text-sm text-gray-500">{placeholder}</p>
        )}
      </div>
      <div className="mt-2 flex items-center gap-3">
        <button type="button" className="btn-secondary btn-sm" onClick={() => inputRef.current?.click()}>
          Upload Local Image
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; loadFile(f); }}
        />
        {value && (
          <button type="button" className="btn-ghost btn-sm text-red-600" onClick={() => onChange('')}>
            Clear Image
          </button>
        )}
      </div>
    </>
  );
}

export function Reports() {
  const {
    congregationOptions, churchName, churchAddress1, churchCity, churchState, churchZip, churchPhone,
    letterSigningName, letterSigningTitle, donorLetterTemplate, loading: settingsLoading, reload: reloadSettings,
  } = useSettings();
  const { user } = useAuth();
  const canViewDonors = user?.role !== 'viewer';
  const [reportType, setReportType] = useState<ReportType>('summary');
  const [donors, setDonors] = useState<DonorOption[]>([]);
  const [donorId, setDonorId] = useState('');
  const [startDate, setStartDate] = useState(yearStartISO());
  const [endDate, setEndDate] = useState(todayISO());
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState('');

  const [congregation, setCongregation] = useState('');
  const [trendsPeriod, setTrendsPeriod] = useState<'weekly' | 'monthly' | 'quarterly' | 'yearly'>('monthly');
  const [donorStatement, setDonorStatement] = useState<DonorStatement | null>(null);
  const [summary, setSummary] = useState<CongregationSummary | null>(null);
  const [trendsReport, setTrendsReport] = useState<TrendsReport | null>(null);
  const [trendsCongregation, setTrendsCongregation] = useState('');
  const hasReport = Boolean(summary || donorStatement || trendsReport);
  const [template, setTemplate] = useState<DonorLetterTemplate>({
    ...STATIC_TEMPLATE_DEFAULTS,
    churchName: '', addressLine1: '', addressLine2: '', phone: '', closingLine2: '',
  });
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [showEmailStatements, setShowEmailStatements] = useState(false);

  useEffect(() => { api.donors.list().then(setDonors); }, []);

  useEffect(() => {
    const signingLine = [letterSigningTitle, letterSigningName].filter(Boolean).join(', ');
    const addressLine2 = [churchCity, [churchState, churchZip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    const settingsDefaults: DonorLetterTemplate = {
      ...STATIC_TEMPLATE_DEFAULTS,
      churchName,
      addressLine1: churchAddress1,
      addressLine2,
      phone: churchPhone,
      closingLine2: signingLine,
    };
    setTemplate({ ...settingsDefaults, ...(donorLetterTemplate ?? {}) });
  }, [churchName, churchAddress1, churchCity, churchState, churchZip, churchPhone, letterSigningName, letterSigningTitle, donorLetterTemplate]);

  // One-time migration: move a template saved in this browser into the shared database setting.
  useEffect(() => {
    if (settingsLoading || !canViewDonors) return;
    let raw: string | null = null;
    try { raw = localStorage.getItem(LEGACY_TEMPLATE_KEY); } catch { return; }
    if (!raw) return;
    if (donorLetterTemplate) {
      // Already shared from another computer — the database copy wins.
      try { localStorage.removeItem(LEGACY_TEMPLATE_KEY); } catch { /* ignore */ }
      return;
    }
    let legacy: Partial<DonorLetterTemplate>;
    try { legacy = JSON.parse(raw); } catch { return; }
    api.settings.update('donorLetterTemplate', legacy)
      .then(() => {
        try { localStorage.removeItem(LEGACY_TEMPLATE_KEY); } catch { /* ignore */ }
        return reloadSettings();
      })
      .catch(() => { /* keep the local copy and retry next time */ });
  }, [settingsLoading, donorLetterTemplate, canViewDonors, reloadSettings]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    setDonorStatement(null);
    setSummary(null);
    setTrendsReport(null);

    try {
      if (reportType === 'donor-statement') {
        if (!donorId) {
          setError('Please select a donor');
          return;
        }
        const data = await api.reports.donorStatement(Number(donorId), startDate, endDate);
        setDonorStatement(data);
      } else if (reportType === 'trends') {
        const data = await api.reports.trends(trendsPeriod, startDate, endDate, congregation || undefined);
        setTrendsReport(data);
        setTrendsCongregation(congregation);
      } else {
        const data = await api.reports.congregationSummary(startDate, endDate, congregation || undefined);
        setSummary(data);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  const getPdfOptions = () => getStatementPdfOptions(`report-${startDate}-to-${endDate}.pdf`);

  const handlePreviewPdf = async () => {
    const reportEl = document.getElementById('report-content');
    if (!reportEl) {
      setError('No report content found to preview');
      return;
    }

    try {
      setError('');
      setPreviewing(true);
      const html2pdf = await loadHtml2Pdf();
      const blob: Blob = await html2pdf().set(getPdfOptions()).from(reportEl).outputPdf('blob');
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const url = URL.createObjectURL(blob as Blob);
      setPreviewUrl(url);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to preview PDF');
    } finally {
      setPreviewing(false);
    }
  };

  const handleExportPdf = async () => {
    const reportEl = document.getElementById('report-content');
    if (!reportEl) {
      setError('No report content found to export');
      return;
    }

    try {
      setError('');
      setExporting(true);
      const html2pdf = await loadHtml2Pdf();
      await html2pdf().set(getPdfOptions()).from(reportEl).save();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to export PDF');
    } finally {
      setExporting(false);
    }
  };

  const updateTemplateField = (field: keyof DonorLetterTemplate, value: string) => {
    setTemplate((prev) => ({ ...prev, [field]: value }));
  };

  const saveTemplate = async () => {
    try {
      setError('');
      setSavingTemplate(true);
      await api.settings.update('donorLetterTemplate', template);
      await reloadSettings();
      setShowTemplateEditor(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? `Could not save template: ${e.message}` : 'Could not save template');
    } finally {
      setSavingTemplate(false);
    }
  };

  const resetTemplate = () => {
    const signingLine = [letterSigningTitle, letterSigningName].filter(Boolean).join(', ');
    const addressLine2 = [churchCity, [churchState, churchZip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    const fresh: DonorLetterTemplate = {
      ...STATIC_TEMPLATE_DEFAULTS,
      churchName,
      addressLine1: churchAddress1,
      addressLine2,
      phone: churchPhone,
      closingLine2: signingLine,
    };
    setTemplate(fresh);
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Reports</h1>
      </div>

      <form onSubmit={handleGenerate} className="card p-6 mb-6">
        <div className="flex flex-wrap gap-4 items-end [&_.input]:h-9">
          <div>
            <label className="label">Report Type</label>
            <select
              className="input"
              value={reportType}
              onChange={(e) => {
                setReportType(e.target.value as ReportType);
                setDonorStatement(null);
                setSummary(null);
                setTrendsReport(null);
                setError('');
              }}
            >
              <option value="summary">Summary</option>
              {canViewDonors && <option value="donor-statement">Donor Statement</option>}
              <option value="trends">Trends</option>
            </select>
          </div>

          {reportType === 'donor-statement' && (
            <div>
              <label className="label">Donor</label>
              <DonorPicker donors={donors} value={donorId} onChange={setDonorId} />
            </div>
          )}

          {(reportType === 'summary' || reportType === 'trends') && (
            <div>
              <label className="label">Congregation</label>
              <select
                className="input"
                value={congregation}
                onChange={(e) => setCongregation(e.target.value)}
              >
                <option value="">All Congregations</option>
                {congregationOptions.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
                <option value="__none__">Unassigned</option>
              </select>
            </div>
          )}

          {reportType === 'trends' && (
            <div>
              <label className="label">Group By</label>
              <select
                className="input"
                value={trendsPeriod}
                onChange={(e) => setTrendsPeriod(e.target.value as 'weekly' | 'monthly' | 'quarterly' | 'yearly')}
              >
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
          )}

          <div>
            <label className="label">Start Date</label>
            <input
              type="date"
              className="input"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <label className="label">End Date</label>
            <input
              type="date"
              className="input"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>

          <div>
            <div className="label invisible" aria-hidden="true">_</div>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Generating...' : 'Generate Report'}
            </button>
          </div>
        </div>
      </form>

      {canViewDonors && reportType === 'donor-statement' && <div className="card p-4 mb-6">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Donor Letter Template</h3>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary btn-sm" onClick={() => setShowTemplateEditor((v) => !v)}>
              {showTemplateEditor ? 'Hide' : 'Edit Template'}
            </button>
            <button type="button" className="btn-primary btn-sm" onClick={() => setShowEmailStatements(true)}>
              <Mail className="h-3.5 w-3.5" />
              Email Statements
            </button>
          </div>
        </div>
        {showTemplateEditor && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="label">Header Image URL (optional)</label>
              <input
                className="input"
                value={template.headerImageUrl.startsWith('data:') ? '(uploaded image)' : template.headerImageUrl}
                readOnly={template.headerImageUrl.startsWith('data:')}
                onChange={(e) => updateTemplateField('headerImageUrl', e.target.value)}
                placeholder="https://.../header.png"
              />
              <ImageDropField
                value={template.headerImageUrl}
                onChange={(url) => updateTemplateField('headerImageUrl', url)}
                onError={setError}
                maxWidth={1200}
                maxHeight={400}
                placeholder="Drop a header image here, or click to browse"
                previewClassName="max-h-28"
              />
              <p className="text-xs text-gray-500 mt-2">
                Tip: Paste an image URL above, or drag an image file from Finder onto the box.
              </p>
            </div>
            <div>
              <label className="label">Church Name</label>
              <input className="input" value={template.churchName} onChange={(e) => updateTemplateField('churchName', e.target.value)} />
            </div>
            <div>
              <label className="label">Phone</label>
              <input className="input" value={template.phone} onChange={(e) => updateTemplateField('phone', e.target.value)} />
            </div>
            <div>
              <label className="label">Address Line 1</label>
              <input className="input" value={template.addressLine1} onChange={(e) => updateTemplateField('addressLine1', e.target.value)} />
            </div>
            <div>
              <label className="label">Address Line 2</label>
              <input className="input" value={template.addressLine2} onChange={(e) => updateTemplateField('addressLine2', e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <label className="label">Body Text (supports {'{churchName}'}, {'{endDate}'}, {'{year}'})</label>
              <textarea className="input min-h-[100px]" value={template.bodyText} onChange={(e) => updateTemplateField('bodyText', e.target.value)} />
            </div>
            <div>
              <label className="label">Total Label</label>
              <input className="input" value={template.totalLabel} onChange={(e) => updateTemplateField('totalLabel', e.target.value)} />
            </div>
            <div />
            <div>
              <label className="label">Closing Line 1</label>
              <input className="input" value={template.closingLine1} onChange={(e) => updateTemplateField('closingLine1', e.target.value)} />
            </div>
            <div>
              <label className="label">Closing Line 2</label>
              <input className="input" value={template.closingLine2} onChange={(e) => updateTemplateField('closingLine2', e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <label className="label">Signature (optional, printed between closing lines)</label>
              <ImageDropField
                value={template.signatureImageUrl}
                onChange={(url) => updateTemplateField('signatureImageUrl', url)}
                onError={setError}
                maxWidth={900}
                maxHeight={300}
                trim
                placeholder="Drop your signature image (PNG) here, or click to browse"
                previewClassName="max-h-24"
              />
              <p className="text-xs text-gray-500 mt-2">
                Tip: A PNG with a transparent background looks best.
              </p>
            </div>
            <div className="md:col-span-2 flex gap-3">
              <button type="button" className="btn-primary btn-sm" onClick={saveTemplate} disabled={savingTemplate}>
                {savingTemplate ? 'Saving...' : 'Save Template'}
              </button>
              <button type="button" className="btn-secondary btn-sm" onClick={resetTemplate}>Reset Default</button>
            </div>
          </div>
        )}
      </div>}

      {hasReport && (
        <div className="mb-4 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={handlePreviewPdf} disabled={previewing || exporting}>
            <Eye className="h-4 w-4" />
            {previewing ? 'Previewing...' : 'Preview PDF'}
          </button>
          <button type="button" className="btn-secondary" onClick={handleExportPdf} disabled={exporting}>
            <Download className="h-4 w-4" />
            {exporting ? 'Exporting...' : 'Export PDF'}
          </button>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      {summary && <SummaryReport data={summary} canViewDonors={canViewDonors} />}
      {donorStatement && <DonorStatementReport data={donorStatement} template={template} />}
      {trendsReport && <TrendsReportView data={trendsReport} congregation={trendsCongregation} />}

      {showEmailStatements && (
        <EmailStatements
          startDate={startDate}
          endDate={endDate}
          template={template}
          onClose={() => setShowEmailStatements(false)}
        />
      )}

      {previewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-white rounded-lg shadow-xl flex flex-col" style={{ width: '90vw', height: '90vh' }}>
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h3 className="font-semibold text-lg">PDF Preview</h3>
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }}
              >
                Close
              </button>
            </div>
            <iframe src={previewUrl} className="flex-1 w-full" title="PDF Preview" />
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryReport({ data, canViewDonors }: { data: CongregationSummary; canViewDonors: boolean }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggle = (congregation: string) =>
    setExpanded((prev) => ({ ...prev, [congregation]: !prev[congregation] }));

  const title = data.congregation
    ? `Summary: ${formatDate(data.startDate)} — ${formatDate(data.endDate)}`
    : `Summary: ${formatDate(data.startDate)} — ${formatDate(data.endDate)}`;

  return (
    <div className="space-y-6" id="report-content">
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="h-5 w-5 text-primary-600" />
          <h2 className="text-lg font-semibold">{title}</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-500">Grand Total</p>
            <p className="text-2xl font-bold font-mono">{formatCurrency(data.grandTotal)}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-500">Total Offerings</p>
            <p className="text-2xl font-bold">{data.totalOfferings}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-500">Unique Donors</p>
            <p className="text-2xl font-bold">{data.uniqueDonors}</p>
          </div>
        </div>
        {data.attendance.services > 0 && (
          <div className="bg-gray-50 rounded-lg p-4 -mt-2">
            <p className="text-sm text-gray-500 mb-1">
              Attendance · {data.attendance.services} service{data.attendance.services !== 1 ? 's' : ''} recorded
              {data.congregation && <span className="text-gray-400"> (all congregations; attendance isn’t split by congregation)</span>}
            </p>
            <div className="flex flex-wrap gap-x-8 gap-y-1 tabular-nums">
              {(() => {
                const a = data.attendance;
                const avg = (n: number) => Math.round(n / a.services);
                return (
                  <>
                    <span><span className="text-xl font-bold">{avg(a.adults + a.children)}</span> <span className="text-sm text-gray-500">average per service</span></span>
                    <span className="text-sm text-gray-600">Adults avg {avg(a.adults)} · Children avg {avg(a.children)}</span>
                    <span className="text-sm text-gray-600">Total {a.adults + a.children} ({a.adults} adults, {a.children} children)</span>
                  </>
                );
              })()}
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="font-semibold">By Fund and Method</h3>
        </div>
        <FundMethodTable cells={data.fundMethod} />
      </div>

      {canViewDonors && (
        <div className="card">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="font-semibold">Donor Offerings</h3>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Donor</th>
                  <th>Envelope</th>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Method</th>
                  <th>Check #</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.congregations.flatMap((c) => c.offeringDetails).map((row) => (
                  <tr key={row.offeringId}>
                    <td className="font-medium whitespace-nowrap">{row.firstName} {row.lastName}</td>
                    <td className="text-gray-500">{row.envelopeNumber ?? '—'}</td>
                    <td className="whitespace-nowrap">{formatDate(row.date)}</td>
                    <td>{row.categoryName}{row.designation && <span className="text-gray-500"> — {row.designation}</span>}</td>
                    <td className="whitespace-nowrap">{paymentMethodLabel(row.paymentMethod)}</td>
                    <td className="text-gray-500">{row.checkNumber ?? '—'}</td>
                    <td className="text-right font-medium whitespace-nowrap font-mono">{formatCurrency(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data.congregations.length > 1 && data.congregations.map((cong) => {
        const isExpanded = expanded[cong.congregation] ?? false;
        const pct = data.grandTotal > 0 ? Math.round((cong.totalAmount / data.grandTotal) * 100) : 0;

        return (
          <div key={cong.congregation} className="card">
            <button
              type="button"
              className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
              onClick={() => toggle(cong.congregation)}
            >
              <div className="flex items-center gap-3">
                <Church className="h-4 w-4 text-gray-400" />
                <h3 className="font-semibold text-left">{cong.congregation}</h3>
                <span className="text-sm text-gray-500">
                  {cong.donorCount} donor{cong.donorCount !== 1 ? 's' : ''} · {cong.offeringCount} offering{cong.offeringCount !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <span className="text-lg font-bold font-mono">{formatCurrency(cong.totalAmount)}</span>
                  <span className="text-sm text-gray-400 ml-2">({pct}%)</span>
                </div>
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4 text-gray-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                )}
              </div>
            </button>

            {isExpanded && (
              <div className="border-t border-gray-200">
                <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
                  <h4 className="text-sm font-semibold text-gray-600">By Fund and Method</h4>
                </div>
                <FundMethodTable cells={cong.fundMethod} />
                {canViewDonors && cong.donors.length > 0 && (
                  <div className="border-t border-gray-200">
                    <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
                      <h4 className="text-sm font-semibold text-gray-600">By Donor</h4>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr>
                            <th>Donor</th>
                            <th className="text-right whitespace-nowrap pl-6">Envelope</th>
                            <th className="text-right whitespace-nowrap pl-6">Offerings</th>
                            <th className="text-right whitespace-nowrap pl-6 min-w-[100px]">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {cong.donors.map((donor) => (
                            <tr key={donor.donorId}>
                              <td className="font-medium">{donor.firstName} {donor.lastName}</td>
                              <td className="text-right whitespace-nowrap pl-6 text-gray-500">{donor.envelopeNumber ?? '—'}</td>
                              <td className="text-right whitespace-nowrap pl-6">{donor.offeringCount}</td>
                              <td className="text-right whitespace-nowrap pl-6 font-medium font-mono">{formatCurrency(donor.totalAmount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const CHART_COLORS = ['#4f46e5', '#0891b2', '#059669', '#d97706', '#dc2626', '#7c3aed', '#db2777'];

const CATEGORY_COLORS: Record<string, string> = {
  General: '#4f46e5',
  Building: '#0891b2',
  Mission: '#059669',
  'Mercy and Lunch': '#d97706',
};
const FEATURED_CATEGORIES = ['General', 'Building', 'Mission', 'Mercy and Lunch'];
const FEATURED_CONGREGATIONS = ['Mandarin', 'English', 'Cantonese', 'Springfield'];
const CONGREGATION_COLORS: Record<string, string> = {
  Mandarin: '#4f46e5',
  English: '#0891b2',
  Cantonese: '#059669',
  Springfield: '#d97706',
};

function currencyTick(value: number): string {
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}k`;
  return `$${value}`;
}

function TrendsReportView({ data, congregation }: { data: TrendsReport; congregation?: string }) {
  const congregationLabel = congregation === '__none__' ? 'Unassigned' : congregation;
  const grandTotal = data.totals.reduce((s, r) => s + r.totalAmount, 0);
  const totalOfferings = data.totals.reduce((s, r) => s + r.offeringCount, 0);
  const peakDonors = data.totals.reduce((max, r) => Math.max(max, r.donorCount), 0);

  // Category chart: filter to featured categories, one selected at a time
  const availableCategories = FEATURED_CATEGORIES.filter((c) => data.categoryNames.includes(c));
  const [selectedCategory, setSelectedCategory] = useState(availableCategories[0] ?? '');
  const categoryChartData = data.totals.map((row) => {
    const amount = data.byCategory
      .filter((r) => r.periodKey === row.periodKey && r.categoryName === selectedCategory)
      .reduce((sum, r) => sum + r.totalAmount, 0);
    return { period: row.period, periodKey: row.periodKey, amount };
  });

  // Congregation chart: filter to featured congregations
  const availableCongregations = FEATURED_CONGREGATIONS.filter((c) =>
    data.congregationNames.includes(c),
  );
  const congregationChartData = data.totals.map((row) => {
    const obj: Record<string, string | number> = { period: row.period };
    for (const cong of availableCongregations) {
      obj[cong] = data.byCongregation
        .filter((r) => r.periodKey === row.periodKey && r.congregation === cong)
        .reduce((sum, r) => sum + r.totalAmount, 0);
    }
    return obj;
  });

  const tooManyPeriods = data.totals.length > 24;

  return (
    <div className="space-y-6" id="report-content">
      {/* Summary cards */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="h-5 w-5 text-primary-600" />
          <h2 className="text-lg font-semibold">
            Trends: {formatDate(data.startDate)} — {formatDate(data.endDate)}
            {congregationLabel ? ` (${congregationLabel})` : ''}
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-500">Total Giving</p>
            <p className="text-2xl font-bold font-mono">{formatCurrency(grandTotal)}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-500">Total Offerings</p>
            <p className="text-2xl font-bold">{totalOfferings}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-500">Peak Active Donors</p>
            <p className="text-2xl font-bold">{peakDonors}</p>
          </div>
        </div>
      </div>

      {tooManyPeriods && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
          Showing {data.totals.length} periods. Consider switching to Monthly, Quarterly, or Yearly for a clearer view.
        </p>
      )}

      {/* Total giving over time */}
      <div className="card p-6">
        <h3 className="font-semibold mb-4">Total Giving Over Time</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data.totals} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="period" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={currencyTick} tick={{ fontSize: 12 }} />
            <Tooltip formatter={(value) => [formatCurrency(Number(value)), 'Total Giving']} />
            <Bar dataKey="totalAmount" name="Total Giving" fill="#4f46e5" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Active donors over time */}
      <div className="card p-6">
        <h3 className="font-semibold mb-4">Active Donors Over Time</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data.totals} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="period" tick={{ fontSize: 12 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip formatter={(value) => [value, 'Donors']} />
            <Bar dataKey="donorCount" name="Donors" fill="#818cf8" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Category chart — one category at a time */}
      {availableCategories.length > 0 && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Giving by Category</h3>
            <div className="flex gap-2">
              {availableCategories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1 rounded-full text-sm font-medium border transition-colors ${
                    selectedCategory === cat
                      ? 'text-white border-transparent'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                  }`}
                  style={selectedCategory === cat ? { backgroundColor: CATEGORY_COLORS[cat] ?? '#4f46e5', borderColor: CATEGORY_COLORS[cat] ?? '#4f46e5' } : {}}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={categoryChartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="period" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={currencyTick} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value) => [formatCurrency(Number(value)), selectedCategory]} />
              <Bar dataKey="amount" name={selectedCategory} fill={CATEGORY_COLORS[selectedCategory] ?? '#4f46e5'} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Congregation chart — featured congregations as grouped bars */}
      {!congregation && availableCongregations.length > 0 && (
        <div className="card p-6">
          <h3 className="font-semibold mb-4">Giving by Congregation</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={congregationChartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="period" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={currencyTick} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              <Legend />
              {availableCongregations.map((cong) => (
                <Bar
                  key={cong}
                  dataKey={cong}
                  fill={CONGREGATION_COLORS[cong] ?? CHART_COLORS[0]}
                  radius={[3, 3, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
