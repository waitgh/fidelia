import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Plus, Search, Mail, Phone, X } from 'lucide-react';
import { SortableHeader, toggleSort, type SortState, type SortDirection } from '../components/SortableHeader.js';

type DonorSortColumn = 'envelope' | 'name' | 'congregation';
const VALID_SORT_COLS: DonorSortColumn[] = ['envelope', 'name', 'congregation'];
const SCROLL_KEY = 'donors_scroll';

interface Donor {
  id: number;
  firstName: string;
  lastName: string;
  spouseName: string | null;
  congregation: string | null;
  email: string | null;
  phone: string | null;
  envelopeNumber: string | null;
  isActive: boolean;
  offeringCount?: number;
}

export function Donors() {
  const [params, setParams] = useSearchParams();
  const [donors, setDonors] = useState<Donor[]>([]);
  const [initialLoad, setInitialLoad] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const pendingScrollRestore = useRef(false);

  const search = params.get('q') ?? '';
  const showInactive = params.get('inactive') === '1';
  const sortCol = (VALID_SORT_COLS.includes(params.get('sort') as DonorSortColumn)
    ? params.get('sort')
    : 'envelope') as DonorSortColumn;
  const sortDir = (params.get('dir') === 'desc' ? 'desc' : 'asc') as SortDirection;
  const sort: SortState<DonorSortColumn> = { column: sortCol, direction: sortDir };

  const getScrollContainer = () => document.getElementById('app-main-scroll');
  const getScrollTop = () => getScrollContainer()?.scrollTop ?? window.scrollY;
  const setScrollTop = (y: number) => {
    const container = getScrollContainer();
    if (container) container.scrollTo({ top: y });
    else window.scrollTo(0, y);
  };
  const rememberScroll = () => sessionStorage.setItem(SCROLL_KEY, String(getScrollTop()));

  const updateParams = useCallback((updates: Record<string, string | null>) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(updates)) {
        if (v === null || v === '') next.delete(k);
        else next.set(k, v);
      }
      return next;
    }, { replace: true });
  }, [setParams]);

  const setSearch = (q: string) => updateParams({ q: q || null });
  const setShowInactive = (on: boolean) => updateParams({ inactive: on ? '1' : null });
  const handleSort = (col: DonorSortColumn) => {
    const next = toggleSort(sort, col);
    updateParams({ sort: next.column, dir: next.direction });
  };

  const sortedDonors = useMemo(() => {
    if (search.trim()) {
      return [...donors].sort((a, b) => {
        const aCount = a.offeringCount ?? 0;
        const bCount = b.offeringCount ?? 0;
        if (aCount !== bCount) return bCount - aCount;
        return a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);
      });
    }
    const list = [...donors];
    const dir = sort.direction === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      switch (sort.column) {
        case 'envelope': {
          const aNum = a.envelopeNumber ? parseInt(a.envelopeNumber, 10) : Infinity;
          const bNum = b.envelopeNumber ? parseInt(b.envelopeNumber, 10) : Infinity;
          if (isNaN(aNum) && isNaN(bNum)) return (a.envelopeNumber ?? '').localeCompare(b.envelopeNumber ?? '') * dir;
          if (isNaN(aNum)) return dir;
          if (isNaN(bNum)) return -dir;
          return (aNum - bNum) * dir;
        }
        case 'name':
          return (a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)) * dir;
        case 'congregation':
          return ((a.congregation ?? '').localeCompare(b.congregation ?? '')) * dir;
        default: return 0;
      }
    });
    return list;
  }, [donors, sort]);

  const refreshDonors = useCallback(() => {
    api.donors.list(search || undefined, showInactive).then(setDonors).catch((e: Error) => setError(e.message));
  }, [search, showInactive]);

  useEffect(() => {
    const saved = sessionStorage.getItem(SCROLL_KEY);
    if (saved && parseInt(saved, 10) > 0) pendingScrollRestore.current = true;
    api.donors.list(search || undefined, showInactive).then((data) => {
      setDonors(data);
      setInitialLoad(false);
    }).catch((e: Error) => {
      setError(e.message);
      setInitialLoad(false);
    });
  }, [search, showInactive]);

  useEffect(() => {
    if (pendingScrollRestore.current && donors.length > 0) {
      pendingScrollRestore.current = false;
      const y = parseInt(sessionStorage.getItem(SCROLL_KEY) ?? '0', 10);
      requestAnimationFrame(() => requestAnimationFrame(() => setScrollTop(y)));
    }
  }, [donors]);

  useEffect(() => {
    const saveScroll = () => rememberScroll();
    const container = getScrollContainer();
    if (container) {
      container.addEventListener('scroll', saveScroll, { passive: true });
      return () => container.removeEventListener('scroll', saveScroll);
    }
    window.addEventListener('scroll', saveScroll, { passive: true });
    return () => window.removeEventListener('scroll', saveScroll);
  }, []);

  const handleRowClick = (id: number) => {
    rememberScroll();
    navigate(`/donors/${id}/edit`);
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Donors</h1>
        <Link to="/donors/new" className="btn-primary">
          <Plus className="h-4 w-4" />
          Add Donor
        </Link>
      </div>

      <div className="mb-6 flex items-center gap-4">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            className="input pl-10 pr-9"
            placeholder="Search by name, spouse, email, or envelope #..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape' && search) { e.preventDefault(); setSearch(''); } }}
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer whitespace-nowrap">
          <input
            type="checkbox"
            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Show inactive
        </label>
      </div>

      {error && <div className="mb-4 text-red-600 text-sm">{error}</div>}

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <SortableHeader label="Env #" column="envelope" current={sort} onSort={handleSort} />
                <SortableHeader label="Name" column="name" current={sort} onSort={handleSort} />
                <SortableHeader label="Congregation" column="congregation" current={sort} onSort={handleSort} />
                <th>Contact</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {initialLoad ? (
                <tr><td colSpan={4} className="text-center py-8 text-gray-400">Loading...</td></tr>
              ) : sortedDonors.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-8 text-gray-400">No donors found</td></tr>
              ) : (
                sortedDonors.map((donor) => (
                  <tr
                    key={donor.id}
                    onClick={() => handleRowClick(donor.id)}
                    className={`cursor-pointer hover:bg-primary-50/60 transition-colors ${!donor.isActive ? 'opacity-50' : ''}`}
                  >
                    <td><span className="badge-gray font-mono">{donor.envelopeNumber ?? '—'}</span></td>
                    <td className="font-medium text-gray-900">
                      {donor.lastName}, {donor.firstName}
                      {donor.spouseName && <span className="text-gray-500"> & {donor.spouseName}</span>}
                    </td>
                    <td className="text-gray-500">{donor.congregation ?? '—'}</td>
                    <td>
                      <div className="flex flex-col gap-0.5">
                        {donor.email && <span className="flex items-center gap-1 text-xs text-gray-500"><Mail className="h-3 w-3" />{donor.email}</span>}
                        {donor.phone && <span className="flex items-center gap-1 text-xs text-gray-500"><Phone className="h-3 w-3" />{donor.phone}</span>}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
