/**
 * Batches.tsx — updated for Fidelia Ledger brand refresh
 *
 * Changes from original:
 *  1. page-title already applies Playfair Display via index.css — no change needed
 *  2. Card section header "Create New Batch" uses font-serif
 *  3. No logic changes
 */

import { useEffect, useState, type ChangeEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { formatCurrency, formatDate, todayISO } from '../lib/formatters.js';
import { Plus, ChevronLeft, ChevronRight, Upload, AlertTriangle } from 'lucide-react';
import { parseCsvObjects } from '../lib/csv.js';
import type { BatchImportPlan } from '../data/batchImport.js';
import { useAuth } from '../lib/auth.js';

const PAGE_SIZE = 20;

function Pagination({ total, offset, onPage }: { total: number; offset: number; onPage: (off: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  function pageNumbers(): (number | '…')[] {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | '…')[] = [1];
    if (currentPage > 3) pages.push('…');
    for (let p = Math.max(2, currentPage - 1); p <= Math.min(totalPages - 1, currentPage + 1); p++) pages.push(p);
    if (currentPage < totalPages - 2) pages.push('…');
    pages.push(totalPages);
    return pages;
  }

  return (
    <div className="flex items-center gap-1">
      <button className="btn-secondary btn-sm px-2" disabled={currentPage === 1} onClick={() => onPage(offset - PAGE_SIZE)}>
        <ChevronLeft className="h-4 w-4" />
      </button>
      {pageNumbers().map((p, i) =>
        p === '…' ? (
          <span key={`e${i}`} className="px-1 text-gray-400 text-sm select-none">…</span>
        ) : (
          <button
            key={p}
            className={`btn-sm px-3 rounded font-medium text-sm ${p === currentPage ? 'bg-primary-600 text-white' : 'btn-secondary'}`}
            onClick={() => onPage((p - 1) * PAGE_SIZE)}
          >
            {p}
          </button>
        )
      )}
      <button className="btn-secondary btn-sm px-2" disabled={currentPage === totalPages} onClick={() => onPage(offset + PAGE_SIZE)}>
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

interface BatchRow {
  id: number;
  date: string;
  description: string | null;
  status: string;
  totalAmount: number;
  offeringCount: number;
}

export function Batches() {
  const { user } = useAuth();
  const isViewer = user?.role === 'viewer';
  const navigate = useNavigate();
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [date, setDate] = useState(todayISO());
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [importRows, setImportRows] = useState<Record<string, string>[] | null>(null);
  const [importPlan, setImportPlan] = useState<BatchImportPlan | null>(null);
  const [importing, setImporting] = useState(false);

  const loadBatches = (off = offset) => {
    api.batches.list({ limit: PAGE_SIZE, offset: off, description: filter.trim() || undefined }).then((data) => {
      setBatches(data.rows);
      setTotal(data.total);
      setOffset(off);
    }).catch(console.error);
  };

  // Debounce so typing in the filter doesn't fire a request per keystroke
  useEffect(() => {
    const t = setTimeout(() => loadBatches(0), 250);
    return () => clearTimeout(t);
  }, [filter]);

  const cancelImport = () => { setImportRows(null); setImportPlan(null); };

  const handleImportFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    cancelImport();
    try {
      const rows = parseCsvObjects(await file.text());
      setImportPlan(await api.batches.planImport(rows));
      setImportRows(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that file');
    }
  };

  const confirmImport = async () => {
    if (!importRows) return;
    setImporting(true);
    setError('');
    try {
      const r = await api.batches.importCsv(importRows);
      cancelImport();
      if (r.batchIds.length === 1) navigate(`/batches/${r.batchIds[0]}`);
      else loadBatches(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const created = await api.batches.create({ date, description: description || null });
      loadBatches(0);
      navigate(`/batches/${created.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create batch');
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Batches</h1>
        {!isViewer && !showForm && (
          <div className="flex items-center gap-2">
            <label className="btn-secondary cursor-pointer" title="Recreate a batch from a file made by Export on a batch page">
              <Upload className="h-4 w-4" />
              Import CSV
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleImportFile} />
            </label>
            <button onClick={() => setShowForm(true)} className="btn-primary">
              <Plus className="h-4 w-4" />
              New Batch
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      {importPlan && (
        <div className="card p-6 mb-6">
          <h3 className="text-lg font-semibold mb-1 font-serif">Import batches</h3>
          {importPlan.errors.length > 0 ? (
            <>
              <p className="text-sm text-red-700 mb-3">
                Nothing will be imported until these {importPlan.errors.length === 1 ? 'problem is' : `${importPlan.errors.length} problems are`} fixed in the file:
              </p>
              <ul className="text-sm space-y-1 mb-4 max-h-60 overflow-y-auto">
                {importPlan.errors.map((e, i) => (
                  <li key={i} className="text-red-700">{e.row > 0 && <span className="font-mono text-gray-500 mr-2">Row {e.row}</span>}{e.message}</li>
                ))}
              </ul>
            </>
          ) : importPlan.batches.length === 0 ? (
            <p className="text-sm text-gray-600 mb-4">That file has no offerings.</p>
          ) : (
            <>
              <p className="text-sm text-gray-600 mb-3">
                This will create {importPlan.batches.length === 1 ? 'a new open batch' : `${importPlan.batches.length} new open batches`}. Fees are recalculated.
              </p>
              <div className="table-container mb-3">
                <table>
                  <thead>
                    <tr><th>Date</th><th>Description</th><th className="text-right">Offerings</th><th className="text-right">Total</th></tr>
                  </thead>
                  <tbody>
                    {importPlan.batches.map((b) => (
                      <tr key={`${b.date}|${b.description ?? ''}`}>
                        <td>{formatDate(b.date)}</td>
                        <td>
                          {b.description ?? <span className="text-gray-400">—</span>}
                          {b.possibleDuplicateId && (
                            <div className="flex items-center gap-1 text-xs text-amber-700 mt-0.5">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              <Link to={`/batches/${b.possibleDuplicateId}`} className="underline">A matching batch</Link>&nbsp;already exists. Importing will duplicate it.
                            </div>
                          )}
                        </td>
                        <td className="text-right">{b.offerings.length}</td>
                        <td className="text-right font-mono">{formatCurrency(b.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {importPlan.newDonors.length > 0 && (
                <p className="text-sm text-amber-700 mb-3">
                  {importPlan.newDonors.length === 1 ? 'This donor is' : `These ${importPlan.newDonors.length} donors are`} not in your donor list and will be added:{' '}
                  {importPlan.newDonors.map((d) => `${d.firstName} ${d.lastName}`).join(', ')}
                </p>
              )}
            </>
          )}
          <div className="flex gap-3">
            {importPlan.errors.length === 0 && importPlan.batches.length > 0 && (
              <button onClick={confirmImport} className="btn-primary btn-sm" disabled={importing}>
                {importing ? 'Importing…' : 'Import'}
              </button>
            )}
            <button onClick={cancelImport} className="btn-secondary btn-sm" disabled={importing}>
              {importPlan.errors.length ? 'Close' : 'Cancel'}
            </button>
          </div>
        </div>
      )}

      {!isViewer && showForm && (
        <form onSubmit={handleCreate} className="card p-6 mb-6 max-w-lg">
          {/* ↓ serif heading added */}
          <h3 className="text-lg font-semibold mb-4 font-serif">Create New Batch</h3>
          <div className="space-y-4">
            <div>
              <label className="label">Date *</label>
              <input type="date" className="input" required value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className="label">Description</label>
              <input
                className="input"
                placeholder="e.g., Sunday Service"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button type="submit" className="btn-primary btn-sm">Create Batch</button>
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary btn-sm">Cancel</button>
          </div>
        </form>
      )}

      <div className="card">
        <div className="px-4 py-3 border-b flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <input
              className="input w-64"
              placeholder="Filter by description (e.g., Vienna)"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <p className="text-sm text-gray-500 whitespace-nowrap">
              {total === 0 ? 'No batches' : `${offset + 1}–${Math.min(offset + PAGE_SIZE, total)} of ${total} batch${total !== 1 ? 'es' : ''}`}
            </p>
          </div>
          {total > PAGE_SIZE && <Pagination total={total} offset={offset} onPage={loadBatches} />}
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Status</th>
                <th className="text-right">Offerings</th>
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {batches.map((batch) => (
                <tr key={batch.id}>
                  <td>
                    <Link to={`/batches/${batch.id}`} className="text-primary-600 hover:underline font-medium">
                      {formatDate(batch.date)}
                    </Link>
                  </td>
                  <td className="text-gray-500">{batch.description ?? '—'}</td>
                  <td>
                    <span className={batch.status === 'open' ? 'badge-yellow' : 'badge-green'}>
                      {batch.status}
                    </span>
                  </td>
                  <td className="text-right">{batch.offeringCount}</td>
                  <td className="text-right font-medium font-mono">{formatCurrency(batch.totalAmount)}</td>
                </tr>
              ))}
              {batches.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-gray-400">
                    {filter.trim() ? 'No batches match this filter.' : 'No batches yet. Create one to start recording offerings.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
