import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { ClipboardList, ChevronLeft, ChevronRight } from 'lucide-react';

interface AuditRow {
  id: number;
  userId: number | null;
  username: string;
  action: string;
  resource: string | null;
  resourceId: number | null;
  detail: string | null;
  ip: string | null;
  createdAt: string;
}

const ACTION_LABELS: Record<string, string> = {
  create_donor: 'Create donor',
  update_donor: 'Update donor',
  deactivate_donor: 'Deactivate donor',
  create_batch: 'Create batch',
  close_batch: 'Close batch',
  reopen_batch: 'Reopen batch',
  delete_batch: 'Delete batch',
  create_offering: 'Create offering',
  update_offering: 'Update offering',
  delete_offering: 'Delete offering',
  create_user: 'Create user',
  update_user: 'Update user',
  delete_user: 'Delete user',
};

const ACTION_COLORS: Record<string, string> = {
  delete_batch: 'bg-red-100 text-red-700',
  delete_offering: 'bg-red-100 text-red-700',
  delete_user: 'bg-red-100 text-red-700',
  deactivate_donor: 'bg-orange-100 text-orange-700',
  close_batch: 'bg-yellow-100 text-yellow-700',
  reopen_batch: 'bg-blue-100 text-blue-700',
};

function actionBadge(action: string) {
  const color = ACTION_COLORS[action] ?? 'bg-indigo-100 text-indigo-700';
  const label = ACTION_LABELS[action] ?? action.replace(/_/g, ' ');
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${color}`}>{label}</span>;
}

function formatTs(ts: string) {
  const d = new Date(ts.endsWith('Z') ? ts : ts + 'Z');
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
}

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

function IpLabel({ ip }: { ip: string | null }) {
  if (!ip) return <span className="text-gray-300">—</span>;
  if (LOOPBACK.has(ip)) return <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">localhost</span>;
  return <span className="font-mono text-xs text-gray-400">{ip}</span>;
}

const PAGE_SIZE = 50;

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
      <button
        className="btn-secondary btn-sm px-2"
        disabled={currentPage === 1}
        onClick={() => onPage(offset - PAGE_SIZE)}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      {pageNumbers().map((p, i) =>
        p === '…' ? (
          <span key={`ellipsis-${i}`} className="px-1 text-gray-400 text-sm select-none">…</span>
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
      <button
        className="btn-secondary btn-sm px-2"
        disabled={currentPage === totalPages}
        onClick={() => onPage(offset + PAGE_SIZE)}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

export function AuditLog() {
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [usernames, setUsernames] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [startDate, setStartDate] = useState(weekAgo);
  const [endDate, setEndDate] = useState(today);
  const [filterUser, setFilterUser] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [offset, setOffset] = useState(0);

  async function load(off = 0) {
    setLoading(true);
    setError('');
    try {
      const data = await api.auditLog.list({
        startDate,
        endDate,
        username: filterUser || undefined,
        action: filterAction || undefined,
        limit: PAGE_SIZE,
        offset: off,
      });
      setRows(data.rows);
      setTotal(data.total);
      setUsernames(data.usernames);
      setOffset(off);
    } catch {
      setError('Failed to load audit log');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(0); }, []);

  function handleFilter(e: React.FormEvent) {
    e.preventDefault();
    load(0);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ClipboardList className="h-6 w-6 text-primary-600" />
        <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
      </div>

      <form onSubmit={handleFilter} className="card p-6 mb-2">
        <div className="flex flex-wrap gap-4 items-end [&_.input]:h-9">
          <div>
            <label className="label">From</label>
            <input type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label className="label">To</label>
            <input type="date" className="input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div>
            <label className="label">User</label>
            <select className="input" value={filterUser} onChange={(e) => setFilterUser(e.target.value)}>
              <option value="">All users</option>
              {usernames.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Action</label>
            <select className="input" value={filterAction} onChange={(e) => setFilterAction(e.target.value)}>
              <option value="">All actions</option>
              {Object.entries(ACTION_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <div className="label invisible" aria-hidden="true">_</div>
            <button type="submit" className="btn-primary">Filter</button>
          </div>
        </div>
      </form>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{error}</div>}

      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {total === 0 ? 'No events' : `${offset + 1}–${Math.min(offset + PAGE_SIZE, total)} of ${total} event${total !== 1 ? 's' : ''}`}
          </p>
          {total > PAGE_SIZE && <Pagination total={total} offset={offset} onPage={(off) => load(off)} />}
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">No events found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-2">Time</th>
                  <th className="px-4 py-2">User</th>
                  <th className="px-4 py-2">Action</th>
                  <th className="px-4 py-2">Detail</th>
                  <th className="px-4 py-2">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 whitespace-nowrap text-gray-500">{formatTs(row.createdAt)}</td>
                    <td className="px-4 py-2 font-medium">{row.username}</td>
                    <td className="px-4 py-2">{actionBadge(row.action)}</td>
                    <td className="px-4 py-2 text-gray-600 max-w-sm break-words whitespace-normal">
                      {row.resourceId ? <span className="text-gray-400 mr-1">#{row.resourceId}</span> : null}
                      {row.detail}
                    </td>
                    <td className="px-4 py-2"><IpLabel ip={row.ip} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
