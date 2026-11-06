/**
 * Batches.tsx — updated for Fidelia Ledger brand refresh
 *
 * Changes from original:
 *  1. page-title already applies Playfair Display via index.css — no change needed
 *  2. Card section header "Create New Batch" uses font-serif
 *  3. No logic changes
 */

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { formatCurrency, formatDate, todayISO } from '../lib/formatters.js';
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react';
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
          <button onClick={() => setShowForm(true)} className="btn-primary">
            <Plus className="h-4 w-4" />
            New Batch
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
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
