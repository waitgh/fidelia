import { useEffect, useMemo, useRef, useState } from 'react';
import { Mail, Send, X, AlertTriangle, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { api } from '../lib/api.js';
import { formatCurrency, formatDate } from '../lib/formatters.js';
import { renderStatementPdf, type DonorLetterTemplate } from './DonorStatementLetter.js';
import type {
  DonorStatement,
  StatementEmailConfig,
  StatementEmailRecipient,
  StatementEmailTemplate,
} from '../../shared/types/index.js';

const DEFAULT_EMAIL_TEMPLATE: StatementEmailTemplate = {
  subject: '{year} Contribution Statement from {churchName}',
  body:
    'Dear {donorName},\n\n' +
    'Thank you for your faithful giving to {churchName}. Attached is your contribution statement for {year}. ' +
    'Please keep it for your tax records.\n\n' +
    'If you have any questions about your statement, simply reply to this email.\n\n' +
    'Blessings,\n{churchName}',
};

/** Microsoft 365 allows ~30 messages/minute per mailbox; stay well under it. */
const MIN_MS_BETWEEN_SENDS = 2500;
const PDF_RENDER_WIDTH_PX = 1100;

function fillPlaceholders(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(donorName|year|churchName)\}/g, (_, k: string) => vars[k] ?? '');
}

async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}

function pdfFilename(year: string, name: string): string {
  const safe = name.replace(/&/g, 'and').replace(/[^\w .()-]/g, '').replace(/\s+/g, ' ').trim();
  return `${year} Contribution Statement - ${safe || 'Donor'}.pdf`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Props {
  startDate: string;
  endDate: string;
  template: DonorLetterTemplate;
  onClose: () => void;
}

export function EmailStatements({ startDate, endDate, template, onClose }: Props) {
  const year = endDate.slice(0, 4);
  const [config, setConfig] = useState<StatementEmailConfig | null>(null);
  const [recipients, setRecipients] = useState<StatementEmailRecipient[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [emailTemplate, setEmailTemplate] = useState<StatementEmailTemplate>(DEFAULT_EMAIL_TEMPLATE);
  const [templateDirty, setTemplateDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [testTo, setTestTo] = useState('');
  const [testDonorId, setTestDonorId] = useState<number | null>(null);
  const [busy, setBusy] = useState<'idle' | 'test' | 'sending'>('idle');
  const [confirming, setConfirming] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, failed: 0 });
  const [rowState, setRowState] = useState<Record<number, 'working' | 'done' | 'error'>>({});
  const stopRef = useRef(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [cfg, list, settings] = await Promise.all([
        api.statementEmails.config(),
        api.statementEmails.recipients(startDate, endDate),
        api.settings.getAll(),
      ]);
      setConfig(cfg);
      setRecipients(list);
      setSelected(new Set(list.filter((r) => r.validEmails.length > 0 && r.total > 0 && r.status !== 'sent').map((r) => r.donorId)));
      setTestDonorId((prev) => prev ?? list.find((r) => r.total > 0)?.donorId ?? null);
      const saved = settings.statementEmailTemplate as Partial<StatementEmailTemplate> | string | undefined;
      if (saved && typeof saved === 'object') setEmailTemplate({ ...DEFAULT_EMAIL_TEMPLATE, ...saved });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load recipients');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [startDate, endDate]);

  const stats = useMemo(() => {
    const withEmail = recipients.filter((r) => r.validEmails.length > 0);
    return {
      total: recipients.length,
      withEmail: withEmail.length,
      noEmail: recipients.length - withEmail.length,
      sent: recipients.filter((r) => r.status === 'sent').length,
    };
  }, [recipients]);

  const canSend = Boolean(config && (config.configured || config.dryRun));

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const updateTemplate = (field: keyof StatementEmailTemplate, value: string) => {
    setEmailTemplate((prev) => ({ ...prev, [field]: value }));
    setTemplateDirty(true);
  };

  const saveEmailTemplate = async () => {
    try {
      await api.settings.update('statementEmailTemplate', emailTemplate);
      setTemplateDirty(false);
      setNotice('Email message saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save email message');
    }
  };

  /** Build the PDF for one donor and send it (to the donor, or to testTo). */
  const sendOne = async (r: StatementEmailRecipient, testAddress?: string) => {
    const statement = (await api.reports.donorStatement(r.donorId, startDate, endDate)) as DonorStatement;
    const pdf = await renderStatementPdf(statement, template, PDF_RENDER_WIDTH_PX);
    const vars = { donorName: r.name, year, churchName: template.churchName };
    return api.statementEmails.send({
      donorId: r.donorId,
      startDate,
      endDate,
      subject: fillPlaceholders(emailTemplate.subject, vars),
      body: fillPlaceholders(emailTemplate.body, vars),
      pdfBase64: await blobToBase64(pdf),
      filename: pdfFilename(year, r.name),
      testTo: testAddress,
    });
  };

  const handleTest = async () => {
    const r = recipients.find((x) => x.donorId === testDonorId);
    if (!r) return setError('Pick a donor whose statement to use for the test.');
    if (!testTo.trim()) return setError('Enter the address to send the test to.');
    setBusy('test');
    setError('');
    setNotice('');
    try {
      const res = await sendOne(r, testTo.trim());
      setNotice(
        res.status === 'dry_run'
          ? `Dry run: test email for ${r.name} saved to data/outbox/ (nothing was sent).`
          : `Test email with ${r.name}'s statement sent to ${res.to.join(', ')}.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Test send failed');
    } finally {
      setBusy('idle');
    }
  };

  const handleSendAll = async () => {
    setConfirming(false);
    const queue = recipients.filter((r) => selected.has(r.donorId) && r.validEmails.length > 0);
    if (queue.length === 0) return;
    stopRef.current = false;
    setBusy('sending');
    setError('');
    setNotice('');
    setRowState({});
    let done = 0;
    let failed = 0;
    setProgress({ done, total: queue.length, failed });

    for (const r of queue) {
      if (stopRef.current) break;
      const started = Date.now();
      setRowState((s) => ({ ...s, [r.donorId]: 'working' }));
      try {
        await sendOne(r);
        setRowState((s) => ({ ...s, [r.donorId]: 'done' }));
      } catch {
        failed++;
        setRowState((s) => ({ ...s, [r.donorId]: 'error' }));
      }
      done++;
      setProgress({ done, total: queue.length, failed });
      const wait = MIN_MS_BETWEEN_SENDS - (Date.now() - started);
      if (wait > 0 && done < queue.length && !stopRef.current) await sleep(wait);
    }

    setBusy('idle');
    setNotice(
      stopRef.current
        ? `Stopped after ${done} of ${queue.length}.`
        : `Finished: ${done - failed} sent${failed ? `, ${failed} failed (select them and send again to retry)` : ''}.`,
    );
    await load();
  };

  const selectedSendable = recipients.filter((r) => selected.has(r.donorId) && r.validEmails.length > 0).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-lg shadow-xl flex flex-col w-full max-w-5xl max-h-[92vh]">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary-600" />
            <h3 className="font-semibold text-lg">Email Statements</h3>
            <span className="text-sm text-gray-500">
              {formatDate(startDate)} – {formatDate(endDate)}
            </span>
          </div>
          <button type="button" className="btn-ghost btn-sm" onClick={onClose} disabled={busy === 'sending'}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-5">
          {config && !config.configured && !config.dryRun && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm flex gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                Email sending isn't set up yet. Missing in <code>.env</code>: {config.missing.join(', ')}. See{' '}
                <code>docs/microsoft-365-email-setup.md</code>. You can still review the list below.
              </div>
            </div>
          )}
          {config?.dryRun && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-800 text-sm">
              Dry-run mode is on: emails are saved to <code>data/outbox/</code> instead of being sent.
            </div>
          )}
          {config?.configured && !config.dryRun && (
            <p className="text-sm text-gray-600">
              Sending as <strong>{config.sender}</strong>. Copies are saved in that mailbox's Sent Items.
            </p>
          )}
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
          {notice && <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm">{notice}</div>}

          <section className="grid grid-cols-1 gap-3">
            <div>
              <label className="label">Subject</label>
              <input className="input" value={emailTemplate.subject} onChange={(e) => updateTemplate('subject', e.target.value)} />
            </div>
            <div>
              <label className="label">Message (supports {'{donorName}'}, {'{year}'}, {'{churchName}'})</label>
              <textarea className="input min-h-[140px]" value={emailTemplate.body} onChange={(e) => updateTemplate('body', e.target.value)} />
            </div>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary btn-sm" onClick={saveEmailTemplate} disabled={!templateDirty}>
                Save Message
              </button>
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => { setEmailTemplate(DEFAULT_EMAIL_TEMPLATE); setTemplateDirty(true); }}
              >
                Reset to default
              </button>
            </div>
          </section>

          <section className="rounded-lg border border-gray-200 p-3">
            <h4 className="font-medium mb-2">Send a test first</h4>
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[14rem] flex-1">
                <label className="label">Use this donor's statement</label>
                <select className="input" value={testDonorId ?? ''} onChange={(e) => setTestDonorId(Number(e.target.value))}>
                  {recipients.map((r) => (
                    <option key={r.donorId} value={r.donorId}>{r.name} — {formatCurrency(r.total)}</option>
                  ))}
                </select>
              </div>
              <div className="min-w-[14rem] flex-1">
                <label className="label">Send test to</label>
                <input className="input" type="email" placeholder="you@example.com" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
              </div>
              <button type="button" className="btn-secondary" onClick={handleTest} disabled={!canSend || busy !== 'idle'}>
                {busy === 'test' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send Test
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">The test goes only to the address above, with “[TEST]” in the subject. The donor is not emailed.</p>
          </section>

          <section>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <h4 className="font-medium">
                Recipients{' '}
                <span className="text-sm font-normal text-gray-500">
                  {stats.total} donors gave · {stats.withEmail} with email · {stats.noEmail} without · {stats.sent} already sent
                </span>
              </h4>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  disabled={busy !== 'idle'}
                  onClick={() => setSelected(new Set(recipients.filter((r) => r.validEmails.length > 0 && r.total > 0 && r.status !== 'sent').map((r) => r.donorId)))}
                >
                  Select unsent
                </button>
                <button type="button" className="btn-ghost btn-sm" disabled={busy !== 'idle'} onClick={() => setSelected(new Set())}>
                  Clear
                </button>
              </div>
            </div>
            {loading ? (
              <div className="py-8 text-center text-gray-500"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
            ) : (
              <div className="table-container max-h-[40vh] overflow-y-auto">
                <table>
                  <thead>
                    <tr>
                      <th className="w-8"></th>
                      <th>Donor</th>
                      <th>Email</th>
                      <th className="text-right">Total</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {recipients.map((r) => {
                      const emailable = r.validEmails.length > 0;
                      const live = rowState[r.donorId];
                      return (
                        <tr key={r.donorId} className={emailable ? '' : 'text-gray-400'}>
                          <td>
                            <input
                              type="checkbox"
                              checked={selected.has(r.donorId)}
                              disabled={!emailable || busy !== 'idle'}
                              onChange={() => toggle(r.donorId)}
                            />
                          </td>
                          <td>{r.name}</td>
                          <td className="text-sm">{emailable ? r.validEmails.join(', ') : <span className="italic">no email{r.email ? ` (invalid: ${r.email})` : ''}</span>}</td>
                          <td className="text-right font-mono">{formatCurrency(r.total)}</td>
                          <td className="text-sm whitespace-nowrap">
                            {live === 'working' ? (
                              <span className="text-primary-600"><Loader2 className="h-3.5 w-3.5 animate-spin inline" /> Sending…</span>
                            ) : live === 'done' ? (
                              <span className="text-green-700"><CheckCircle2 className="h-3.5 w-3.5 inline" /> Done</span>
                            ) : live === 'error' || r.status === 'failed' ? (
                              <span className="text-red-600" title={r.lastError ?? ''}><XCircle className="h-3.5 w-3.5 inline" /> Failed{r.lastError ? `: ${r.lastError}` : ''}</span>
                            ) : r.status === 'sent' ? (
                              <span className="text-green-700">Sent {r.sentAt ? formatDate(r.sentAt.slice(0, 10)) : ''}</span>
                            ) : r.status === 'dry_run' ? (
                              <span className="text-blue-700">Dry run</span>
                            ) : (
                              <span className="text-gray-500">Not sent</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {stats.noEmail > 0 && (
              <p className="text-xs text-gray-500 mt-2">
                {stats.noEmail} donors have no email on file. Add emails on the Donors page, or print their letters from the Donor Statement report.
              </p>
            )}
          </section>
        </div>

        <div className="border-t px-5 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-gray-600">
            {busy === 'sending'
              ? `Sending ${progress.done} of ${progress.total}${progress.failed ? ` · ${progress.failed} failed` : ''}…`
              : `${selectedSendable} selected`}
          </div>
          <div className="flex gap-2">
            {busy === 'sending' ? (
              <button type="button" className="btn-secondary" onClick={() => { stopRef.current = true; }}>
                Stop
              </button>
            ) : confirming ? (
              <>
                <span className="text-sm self-center">
                  Email {selectedSendable} statements{config?.sender && !config.dryRun ? ` from ${config.sender}` : ''}?
                </span>
                <button type="button" className="btn-secondary" onClick={() => setConfirming(false)}>Cancel</button>
                <button type="button" className="btn-primary" onClick={handleSendAll}>Yes, send</button>
              </>
            ) : (
              <button
                type="button"
                className="btn-primary"
                disabled={!canSend || selectedSendable === 0 || busy !== 'idle'}
                onClick={() => setConfirming(true)}
              >
                <Send className="h-4 w-4" />
                Send {selectedSendable} Statements
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
