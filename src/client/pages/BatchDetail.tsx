import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { formatCurrency, formatDate, paymentMethodLabel } from '../lib/formatters.js';
import { ArrowLeft, Plus, Trash2, CheckCircle2, RotateCcw, Pencil, Check, X, UserPlus, Copy, FileUp, ArrowRightLeft, BarChart2, Download } from 'lucide-react';
import { downloadCsv } from '../lib/csv.js';
import { batchToCsv, batchCsvFilename } from '../lib/batchExport.js';
import { DonorPicker } from '../components/DonorPicker.js';
import { ImportPayPal } from '../components/ImportPayPal.js';
import { ImportZelle } from '../components/ImportZelle.js';
import { SortableHeader, toggleSort, type SortState } from '../components/SortableHeader.js';
import { useSettings } from '../lib/settings.js';

interface BatchData {
  id: number;
  date: string;
  description: string | null;
  status: string;
  totalAmount: number;
  offeringCount: number;
  offerings: OfferingRow[];
}

interface OfferingRow {
  id: number;
  donorId: number;
  categoryId: number;
  amount: number;
  feeAmount: number | null;
  paymentMethod: string;
  checkNumber: string | null;
  notes: string | null;
  donorFirstName: string;
  donorLastName: string;
  donorCongregation: string | null;
  categoryName: string;
}

interface DonorStatementResult {
  donor: { firstName: string; lastName: string; envelopeNumber: string | null };
  offerings: { date: string; category: string; paymentMethod: string; amount: number }[];
  totalsByCategory: Record<string, number>;
  grandTotal: number;
}

interface DonorOption {
  id: number;
  firstName: string;
  lastName: string;
  spouseName: string | null;
  envelopeNumber: string | null;
  email: string | null;
  isActive?: boolean;
}

interface CategoryOption {
  id: number;
  name: string;
  isActive?: boolean;
}

interface EditState {
  donorId: string;
  categoryId: string;
  amount: string;
  paymentMethod: string;
  checkNumber: string;
  notes: string;
}

type OfferingSortColumn = 'donor' | 'congregation' | 'category' | 'method' | 'checkNumber' | 'amount';

export function BatchDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { offeringMethodOptions } = useSettings();
  const defaultPaymentMethod = offeringMethodOptions[0]?.value ?? 'cash';
  const canEditBatch = user?.role !== 'viewer';
  const [batch, setBatch] = useState<BatchData | null>(null);
  const [donors, setDonors] = useState<DonorOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState<'paypal' | 'zelle' | null>(null);
  const [importMenuOpen, setImportMenuOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [showNewDonorModal, setShowNewDonorModal] = useState(false);
  const [newDonorFirst, setNewDonorFirst] = useState('');
  const [newDonorLast, setNewDonorLast] = useState('');
  const [newDonorAddress, setNewDonorAddress] = useState('');
  const [newDonorCity, setNewDonorCity] = useState('');
  const [newDonorState, setNewDonorState] = useState('');
  const [newDonorZip, setNewDonorZip] = useState('');
  const [newDonorSaving, setNewDonorSaving] = useState(false);
  const [error, setError] = useState('');
  const [sort, setSort] = useState<SortState<OfferingSortColumn>>({ column: 'donor', direction: 'asc' });
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0);
  const [reassignOffering, setReassignOffering] = useState<OfferingRow | null>(null);
  const [allBatches, setAllBatches] = useState<{ id: number; date: string; description: string | null }[]>([]);
  const [reassignBatchId, setReassignBatchId] = useState('');
  const [reassignSaving, setReassignSaving] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [savingDescription, setSavingDescription] = useState(false);
  const [historyDonor, setHistoryDonor] = useState<{ id: number; name: string } | null>(null);
  const [historyYear, setHistoryYear] = useState(new Date().getFullYear());
  const [historyData, setHistoryData] = useState<DonorStatementResult | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [donorId, setDonorId] = useState('');
  const [formRows, setFormRows] = useState<{ amount: string; categoryId: string; paymentMethod: string; checkNumber: string }[]>(
    [{ amount: '', categoryId: '', paymentMethod: 'cash', checkNumber: '' }],
  );
  const [notes, setNotes] = useState('');
  const amountRefs = useRef<(HTMLInputElement | null)[]>([]);
  const checkNumberRefs = useRef<(HTMLInputElement | null)[]>([]);
  const donorTriggerRef = useRef<HTMLButtonElement>(null);
  const importMenuRef = useRef<HTMLDivElement>(null);

  const loadBatch = useCallback(() => {
    if (!id) return;
    api.batches.get(Number(id)).then(setBatch).catch(console.error);
  }, [id]);

  const loadDonors = useCallback(() => {
    api.donors.list(undefined, true).then(setDonors);
  }, []);

  useEffect(() => {
    if (!importMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (importMenuRef.current && !importMenuRef.current.contains(e.target as Node)) {
        setImportMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [importMenuOpen]);

  useEffect(() => {
    loadBatch();
    loadDonors();
    api.categories.list().then((cats) => {
      setCategories(cats);
      const general = cats.find((c: CategoryOption) => c.name.toLowerCase() === 'general');
      if (general) setFormRows([{ amount: '', categoryId: String(general.id), paymentMethod: defaultPaymentMethod, checkNumber: '' }]);
    });
  }, [loadBatch, loadDonors]);

  const defaultCategoryId = () => {
    const general = categories.find((c) => c.name.toLowerCase() === 'general');
    return general ? String(general.id) : '';
  };

  const resetForm = () => {
    setDonorId('');
    setFormRows([{ amount: '', categoryId: defaultCategoryId(), paymentMethod: defaultPaymentMethod, checkNumber: '' }]);
    setNotes('');
    setError('');
  };

  const updateRow = (idx: number, field: 'amount' | 'categoryId' | 'paymentMethod' | 'checkNumber', value: string) => {
    setFormRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  };

  const duplicateRow = (idx: number) => {
    setFormRows((prev) => {
      const copy = { ...prev[idx]! };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
    setTimeout(() => amountRefs.current[idx + 1]?.focus(), 0);
  };

  const removeRow = (idx: number) => {
    setFormRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const openNewDonorModal = () => {
    setNewDonorFirst('');
    setNewDonorLast('');
    setNewDonorAddress('');
    setNewDonorCity('');
    setNewDonorState('');
    setNewDonorZip('');
    setShowNewDonorModal(true);
  };

  const handleCreateDonor = async (e: React.FormEvent) => {
    e.preventDefault();
    setNewDonorSaving(true);
    setError('');

    try {
      const created = await api.donors.create({
        firstName: newDonorFirst,
        lastName: newDonorLast,
        address: newDonorAddress || null,
        city: newDonorCity || null,
        state: newDonorState || null,
        zipCode: newDonorZip || null,
      });
      setShowNewDonorModal(false);
      await loadDonors();
      setDonorId(String(created.id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create donor');
    } finally {
      setNewDonorSaving(false);
    }
  };

  const handleAddOffering = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      for (const row of formRows) {
        await api.offerings.create({
          batchId: Number(id),
          donorId: Number(donorId),
          categoryId: Number(row.categoryId),
          amount: parseFloat(row.amount),
          paymentMethod: row.paymentMethod,
          checkNumber: row.checkNumber || null,
          notes: notes || null,
        });
      }
      resetForm();
      loadBatch();
      setTimeout(() => donorTriggerRef.current?.click(), 0);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to add offering');
    }
  };

  const startEdit = (o: OfferingRow) => {
    setEditingId(o.id);
    setEditState({
      donorId: String(o.donorId),
      categoryId: String(o.categoryId),
      amount: String(o.amount),
      paymentMethod: o.paymentMethod,
      checkNumber: o.checkNumber ?? '',
      notes: o.notes ?? '',
    });
    setError('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditState(null);
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editState) return;
    setError('');

    try {
      await api.offerings.update(editingId, {
        donorId: Number(editState.donorId),
        categoryId: Number(editState.categoryId),
        amount: parseFloat(editState.amount),
        paymentMethod: editState.paymentMethod,
        checkNumber: editState.checkNumber || null,
        notes: editState.notes || null,
      });
      cancelEdit();
      loadBatch();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to update offering');
    }
  };

  const handleDeleteOffering = async (offeringId: number) => {
    if (!confirm('Delete this offering?')) return;
    try {
      await api.offerings.delete(offeringId);
      loadBatch();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete');
    }
  };

  const openReassign = async (o: OfferingRow) => {
    setReassignOffering(o);
    setReassignBatchId('');
    if (allBatches.length === 0) {
      const result = await api.batches.list({ limit: 100 });
      setAllBatches(result.rows.filter((b: any) => b.id !== Number(id)));
    } else {
      setAllBatches(prev => prev.filter(b => b.id !== Number(id)));
    }
  };

  const handleReassign = async () => {
    if (!reassignOffering || !reassignBatchId) return;
    setReassignSaving(true);
    try {
      await api.offerings.reassign(reassignOffering.id, Number(reassignBatchId));
      setReassignOffering(null);
      loadBatch();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to reassign');
    } finally {
      setReassignSaving(false);
    }
  };

  const handleDeleteBatch = async () => {
    try {
      await api.batches.delete(Number(id));
      navigate('/batches');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete batch');
      setDeleteStep(0);
    }
  };

  const handleToggleStatus = async () => {
    if (!batch) return;
    try {
      if (batch.status === 'open') {
        await api.batches.close(batch.id);
      } else {
        await api.batches.reopen(batch.id);
      }
      loadBatch();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to update batch');
    }
  };

  const startEditDescription = () => {
    if (!batch) return;
    setDescriptionDraft(batch.description ?? '');
    setEditingDescription(true);
  };

  const cancelEditDescription = () => {
    setEditingDescription(false);
    setDescriptionDraft('');
  };

  const saveDescription = async () => {
    if (!batch) return;
    setSavingDescription(true);
    setError('');
    try {
      await api.batches.update(batch.id, { description: descriptionDraft.trim() || null });
      setEditingDescription(false);
      loadBatch();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to update description');
    } finally {
      setSavingDescription(false);
    }
  };

  if (!batch) {
    return <div className="text-gray-500 p-4">Loading...</div>;
  }

  const isOpen = batch.status === 'open';

  const summaryByCategory: Record<string, number> = {};
  for (const o of batch.offerings) {
    summaryByCategory[o.categoryName] = (summaryByCategory[o.categoryName] ?? 0) + o.amount;
  }

  const summaryByMethod: Record<string, { total: number; fees: number }> = {};
  for (const o of batch.offerings) {
    const label = paymentMethodLabel(o.paymentMethod);
    if (!summaryByMethod[label]) summaryByMethod[label] = { total: 0, fees: 0 };
    summaryByMethod[label].total += o.amount;
    summaryByMethod[label].fees += o.feeAmount ?? 0;
  }

  const totalFees = batch.offerings.reduce((sum, o) => sum + (o.feeAmount ?? 0), 0);
  const netTotal = batch.totalAmount - totalFees;

  const sortedOfferings = [...batch.offerings].sort((a, b) => {
    const dir = sort.direction === 'asc' ? 1 : -1;
    switch (sort.column) {
      case 'donor': {
        const cmp = a.donorLastName.localeCompare(b.donorLastName) || a.donorFirstName.localeCompare(b.donorFirstName);
        return cmp * dir;
      }
      case 'congregation':
        return ((a.donorCongregation ?? '').localeCompare(b.donorCongregation ?? '')) * dir;
      case 'category':
        return a.categoryName.localeCompare(b.categoryName) * dir;
      case 'method':
        return a.paymentMethod.localeCompare(b.paymentMethod) * dir;
      case 'checkNumber':
        return ((a.checkNumber ?? '').localeCompare(b.checkNumber ?? '')) * dir;
      case 'amount':
        return (a.amount - b.amount) * dir;
      default:
        return 0;
    }
  });

  const handleSort = (col: OfferingSortColumn) => {
    setSort(toggleSort(sort, col, col === 'amount' ? 'desc' : 'asc'));
  };

  const openDonorHistory = async (donorId: number, donorName: string, year = new Date().getFullYear()) => {
    setHistoryDonor({ id: donorId, name: donorName });
    setHistoryYear(year);
    setHistoryLoading(true);
    setHistoryData(null);
    const data = await api.reports.donorStatement(donorId, `${year}-01-01`, `${year}-12-31`);
    setHistoryData(data as DonorStatementResult);
    setHistoryLoading(false);
  };
  const closeHistory = () => { setHistoryDonor(null); setHistoryData(null); };

  return (
    <div>
      <div className="page-header">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(canEditBatch ? '/batches' : '/')} className="btn-ghost btn-sm">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="page-title">{formatDate(batch.date)}</h1>
            {canEditBatch && editingDescription ? (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={descriptionDraft}
                  onChange={(e) => setDescriptionDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') cancelEditDescription();
                    if (e.key === 'Enter') void saveDescription();
                  }}
                  placeholder="Description (optional)"
                  className="input text-sm max-w-md min-w-[12rem]"
                  disabled={savingDescription}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => void saveDescription()}
                  disabled={savingDescription}
                  className="btn-primary btn-sm"
                  title="Save description"
                >
                  <Check className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={cancelEditDescription}
                  disabled={savingDescription}
                  className="btn-secondary btn-sm"
                  title="Cancel"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="mt-1 flex items-center gap-2">
                <p className="text-sm text-gray-500">
                  {batch.description?.trim() ? batch.description : 'No description'}
                </p>
                {canEditBatch && (
                  <button
                    type="button"
                    onClick={startEditDescription}
                    className="btn-ghost btn-sm p-1 text-gray-400 hover:text-primary-600"
                    title="Edit description"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>
          <span className={batch.status === 'open' ? 'badge-yellow ml-3' : 'badge-green ml-3'}>
            {batch.status}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => downloadCsv(batchCsvFilename(batch), batchToCsv(batch))}
            className="btn-secondary"
            title="Download this batch as a spreadsheet (CSV)"
            disabled={batch.offerings.length === 0}
          >
            <Download className="h-4 w-4" />
            Export
          </button>
        {canEditBatch && (
          <>
            {isOpen && (
              <>
                <button onClick={() => setShowForm(!showForm)} className="btn-primary">
                  <Plus className="h-4 w-4" />
                  Add Offering
                </button>
                <div className="relative" ref={importMenuRef}>
                  <button onClick={() => setImportMenuOpen((v) => !v)} className="btn-secondary">
                    <FileUp className="h-4 w-4" />
                    Import
                  </button>
                  {importMenuOpen && (
                    <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1">
                      <button
                        className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
                        onClick={() => { setShowImport('zelle'); setImportMenuOpen(false); }}
                      >
                        Zelle (Bank Statement)
                      </button>
                      <button
                        className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
                        onClick={() => { setShowImport('paypal'); setImportMenuOpen(false); }}
                      >
                        PayPal Screenshot
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
            <button onClick={handleToggleStatus} className={isOpen ? 'btn-secondary' : 'btn-ghost text-amber-600'}>
              {isOpen ? <CheckCircle2 className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
              {isOpen ? 'Close Batch' : 'Reopen'}
            </button>
            <button onClick={() => setDeleteStep(1)} className="btn-ghost text-red-600" title="Delete batch">
              <Trash2 className="h-4 w-4" />
            </button>
          </>
        )}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="stat-card">
          <p className="stat-label">Total (Gross)</p>
          <p className="text-2xl font-bold text-gray-900 font-mono">{formatCurrency(batch.totalAmount)}</p>
          {totalFees > 0 && (
            <div className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Fees</span>
                <span className="text-red-600 font-mono text-right w-24">−{formatCurrency(totalFees)}</span>
              </div>
              <div className="flex justify-between border-t pt-1">
                <span className="text-gray-600 font-medium">Net</span>
                <span className="font-semibold font-mono text-right w-24">{formatCurrency(netTotal)}</span>
              </div>
            </div>
          )}
        </div>
        <div className="stat-card">
          <p className="stat-label">By Category</p>
          <div className="mt-2 space-y-1">
            {Object.entries(summaryByCategory).sort(([a], [b]) => {
                const order = ['General', 'Building', 'Mission'];
                const ai = order.indexOf(a);
                const bi = order.indexOf(b);
                if (ai !== -1 && bi !== -1) return ai - bi;
                if (ai !== -1) return -1;
                if (bi !== -1) return 1;
                return a.localeCompare(b);
              }).map(([cat, total]) => (
              <div key={cat} className="flex justify-between text-sm">
                <span className="text-gray-600">{cat}</span>
                <span className="font-medium font-mono text-right w-24">{formatCurrency(total)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="stat-card">
          <p className="stat-label">By Method</p>
          <div className="mt-2 space-y-1">
            {Object.entries(summaryByMethod).sort(([a], [b]) => {
                const order = offeringMethodOptions.map((m) => m.label);
                const ai = order.indexOf(a);
                const bi = order.indexOf(b);
                if (ai !== -1 && bi !== -1) return ai - bi;
                if (ai !== -1) return -1;
                if (bi !== -1) return 1;
                return a.localeCompare(b);
              }).map(([method, { total, fees }]) => (
              <div key={method} className="text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">{method}</span>
                  <span className="font-medium font-mono text-right w-24">{formatCurrency(total)}</span>
                </div>
                {fees > 0 && (
                  <div className="flex justify-end text-xs gap-1 pl-2">
                    <span className="text-red-500 font-mono">−{formatCurrency(fees)}</span>
                    <span className="text-gray-500 font-mono">net {formatCurrency(total - fees)}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {showForm && isOpen && canEditBatch && (
        <form onSubmit={handleAddOffering} className="card p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">Add Offering</h3>

          <div className="mb-4">
            <label className="label">Donor *</label>
            <div className="flex gap-2">
              <div className="flex-1 max-w-md">
                <DonorPicker
                    donors={donors}
                    value={donorId}
                    onChange={(id) => { setDonorId(id); setTimeout(() => amountRefs.current[0]?.focus(), 0); }}
                    required
                    triggerRef={donorTriggerRef}
                  />
              </div>
              <button
                type="button"
                onClick={openNewDonorModal}
                className="btn-secondary shrink-0"
                title="Add new donor"
              >
                <UserPlus className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {formRows.map((row, idx) => (
              <div key={idx} className="grid grid-cols-1 md:grid-cols-[8rem_1fr_10rem_7rem_auto] gap-3 items-end [&_.input]:h-9">
                <div>
                  {idx === 0 && <label className="label">Amount *</label>}
                  <input
                    ref={(el) => { amountRefs.current[idx] = el; }}
                    type="number"
                    step="0.01"
                    min="0.01"
                    className="input"
                    required
                    placeholder="0.00"
                    value={row.amount}
                    onChange={(e) => updateRow(idx, 'amount', e.target.value)}
                  />
                </div>
                <div>
                  {idx === 0 && <label className="label">Category *</label>}
                  <select
                    className="input"
                    required
                    value={row.categoryId}
                    onChange={(e) => updateRow(idx, 'categoryId', e.target.value)}
                  >
                    <option value="">Select...</option>
                    {categories
                      .filter((c) => c.isActive !== false)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  {idx === 0 && <label className="label">Method *</label>}
                  <select
                    className="input"
                    value={row.paymentMethod}
                    onChange={(e) => {
                      updateRow(idx, 'paymentMethod', e.target.value);
                    }}
                  >
                    {offeringMethodOptions.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  {idx === 0 && <label className="label">Check #</label>}
                  <input
                    ref={(el) => { checkNumberRefs.current[idx] = el; }}
                    className="input"
                    placeholder="—"
                    value={row.checkNumber}
                    onChange={(e) => updateRow(idx, 'checkNumber', e.target.value)}
                    disabled={row.paymentMethod !== 'check'}
                  />
                </div>
                <div className={`flex gap-1 ${idx === 0 ? 'mt-5' : ''}`}>
                  <button
                    type="button"
                    onClick={() => duplicateRow(idx)}
                    className="btn-ghost btn-sm text-primary-600"
                    title="Duplicate row"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                  {formRows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeRow(idx)}
                      className="btn-ghost btn-sm text-red-500"
                      title="Remove row"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex gap-3">
            <button type="submit" className="btn-primary btn-sm">
              {formRows.length > 1 ? `Add ${formRows.length} Offerings` : 'Add Offering'}
            </button>
            <button type="button" onClick={() => { resetForm(); setShowForm(false); }} className="btn-secondary btn-sm">
              Cancel
            </button>
          </div>
        </form>
      )}

      {canEditBatch && <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <SortableHeader label="Donor" column="donor" current={sort} onSort={handleSort} />
                <SortableHeader label="Congregation" column="congregation" current={sort} onSort={handleSort} />
                <SortableHeader label="Category" column="category" current={sort} onSort={handleSort} />
                <SortableHeader label="Method" column="method" current={sort} onSort={handleSort} />
                <SortableHeader label="Check #" column="checkNumber" current={sort} onSort={handleSort} />
                <SortableHeader label="Amount" column="amount" current={sort} onSort={handleSort} className="text-right" />
                {isOpen && <th style={{textAlign: 'center'}}>Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedOfferings.map((o) =>
                isOpen && editingId === o.id && editState ? (
                  <tr key={o.id} className="bg-primary-50">
                    <td>
                      <DonorPicker
                        donors={donors}
                        value={editState.donorId}
                        onChange={(val) => setEditState({ ...editState, donorId: val })}
                        compact
                      />
                    </td>
                    <td className="text-gray-500 text-sm">{o.donorCongregation ?? '—'}</td>
                    <td>
                      <select
                        className="input py-1 text-sm"
                        value={editState.categoryId}
                        onChange={(e) => setEditState({ ...editState, categoryId: e.target.value })}
                      >
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        className="input py-1 text-sm"
                        value={editState.paymentMethod}
                        onChange={(e) => setEditState({ ...editState, paymentMethod: e.target.value })}
                      >
                        {offeringMethodOptions.map((m) => (
                          <option key={m.value} value={m.value}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        className="input py-1 text-sm w-24"
                        value={editState.checkNumber}
                        onChange={(e) => setEditState({ ...editState, checkNumber: e.target.value })}
                        disabled={editState.paymentMethod !== 'check'}
                        placeholder="—"
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        className="input py-1 text-sm text-right w-28"
                        value={editState.amount}
                        onChange={(e) => setEditState({ ...editState, amount: e.target.value })}
                      />
                    </td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={handleSaveEdit} className="btn-ghost btn-sm text-green-600" title="Save">
                          <Check className="h-4 w-4" />
                        </button>
                        <button onClick={cancelEdit} className="btn-ghost btn-sm text-gray-500" title="Cancel">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={o.id}>
                    <td className="font-medium text-gray-900">
                      <div className="flex items-center gap-1.5">
                        <Link
                          to={`/donors/${o.donorId}/edit`}
                          className="hover:text-primary-600 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {o.donorLastName}, {o.donorFirstName}
                        </Link>
                        <button
                          onClick={(e) => { e.stopPropagation(); openDonorHistory(o.donorId, `${o.donorLastName}, ${o.donorFirstName}`); }}
                          className="p-0.5 text-gray-300 hover:text-primary-500 transition-colors"
                          title="View giving history"
                        >
                          <BarChart2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                    <td className="text-gray-500">{o.donorCongregation ?? '—'}</td>
                    <td>{o.categoryName}</td>
                    <td>
                      <span className="badge-gray">{paymentMethodLabel(o.paymentMethod)}</span>
                    </td>
                    <td className="font-mono text-gray-500">{o.checkNumber ?? '—'}</td>
                    <td className="text-right font-medium font-mono">
                      <span>{formatCurrency(o.amount)}</span>
                      {o.feeAmount != null && o.feeAmount > 0 && (
                        <div className="text-xs text-gray-400 mt-0.5">
                          <span className="text-red-500">−{formatCurrency(o.feeAmount)}</span>
                          {' '}
                          <span className="text-gray-600">net {formatCurrency(o.amount - o.feeAmount)}</span>
                        </div>
                      )}
                    </td>
                    {isOpen && (
                      <td style={{textAlign: 'center'}}>
                        <div style={{display:'flex', justifyContent:'center', alignItems:'center', gap:'4px'}}>
                          <button
                            onClick={() => startEdit(o)}
                            className="btn-ghost btn-sm text-primary-600"
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => openReassign(o)}
                            className="btn-ghost btn-sm text-gray-500"
                            title="Reassign to another batch"
                          >
                            <ArrowRightLeft className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteOffering(o.id)}
                            className="btn-ghost btn-sm text-red-600"
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ),
              )}
              {batch.offerings.length === 0 && (
                <tr>
                  <td colSpan={isOpen ? 7 : 6} className="text-center py-8 text-gray-400">
                    No offerings in this batch yet
                  </td>
                </tr>
              )}
            </tbody>
            {batch.offerings.length > 0 && (
              <tfoot>
                <tr className="bg-gray-50">
                  <td colSpan={isOpen ? 5 : 4} className="font-semibold text-gray-700 px-4 py-3">
                    Total
                  </td>
                  <td className="text-right px-4 py-3 font-mono">
                    <span className="font-bold text-gray-900">{formatCurrency(batch.totalAmount)}</span>
                    {totalFees > 0 && (
                      <div className="text-xs mt-0.5">
                        <span className="text-red-500">−{formatCurrency(totalFees)}</span>
                        {' '}
                        <span className="text-gray-600 font-semibold">net {formatCurrency(netTotal)}</span>
                      </div>
                    )}
                  </td>
                  {isOpen && <td />}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>}

      {showNewDonorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowNewDonorModal(false)} />
          <form
            onSubmit={handleCreateDonor}
            className="relative bg-white rounded-xl shadow-2xl p-6 w-full max-w-md mx-4"
          >
            <div className="flex items-center gap-2 mb-5">
              <UserPlus className="h-5 w-5 text-primary-600" />
              <h3 className="text-lg font-semibold">Quick Add Donor</h3>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              Enter the essentials now. You can add full details later from the Donors page.
            </p>
            <div className="space-y-3">
              <div>
                <label className="label">First Name *</label>
                <input
                  className="input"
                  required
                  autoFocus
                  value={newDonorFirst}
                  onChange={(e) => setNewDonorFirst(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Last Name *</label>
                <input
                  className="input"
                  required
                  value={newDonorLast}
                  onChange={(e) => setNewDonorLast(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Address</label>
                <input
                  className="input"
                  placeholder="Optional"
                  value={newDonorAddress}
                  onChange={(e) => setNewDonorAddress(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-6 gap-3">
                <div className="col-span-3">
                  <label className="label">City</label>
                  <input
                    className="input"
                    value={newDonorCity}
                    onChange={(e) => setNewDonorCity(e.target.value)}
                  />
                </div>
                <div className="col-span-1">
                  <label className="label">State</label>
                  <input
                    className="input"
                    value={newDonorState}
                    onChange={(e) => setNewDonorState(e.target.value)}
                  />
                </div>
                <div className="col-span-2">
                  <label className="label">ZIP</label>
                  <input
                    className="input"
                    value={newDonorZip}
                    onChange={(e) => setNewDonorZip(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button type="submit" className="btn-primary flex-1" disabled={newDonorSaving}>
                {newDonorSaving ? 'Saving...' : 'Add Donor'}
              </button>
              <button
                type="button"
                onClick={() => setShowNewDonorModal(false)}
                className="btn-secondary"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {deleteStep === 1 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteStep(0)} />
          <div className="relative bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Batch?</h3>
            <p className="text-sm text-gray-600 mb-1">
              This will permanently delete this batch and all <strong>{batch.offeringCount}</strong> offering{batch.offeringCount !== 1 ? 's' : ''} in it.
            </p>
            <p className="text-sm font-medium text-red-600 mb-5">This action cannot be undone.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteStep(0)} className="btn-secondary btn-sm">
                Cancel
              </button>
              <button
                onClick={() => setDeleteStep(2)}
                className="btn-sm bg-red-600 text-white hover:bg-red-700 rounded-lg px-4 py-2"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteStep === 2 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteStep(0)} />
          <div className="relative bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-lg font-semibold text-red-700 mb-2">Are you absolutely sure?</h3>
            <p className="text-sm text-gray-600 mb-1">
              You are about to delete <strong>{formatDate(batch.date)}</strong> batch with <strong>{formatCurrency(batch.totalAmount)}</strong> in offerings.
            </p>
            <p className="text-sm font-medium text-red-600 mb-5">All data entry work will be permanently lost.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteStep(0)} className="btn-secondary btn-sm">
                Cancel
              </button>
              <button
                onClick={handleDeleteBatch}
                className="btn-sm bg-red-600 text-white hover:bg-red-700 rounded-lg px-4 py-2"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {showImport === 'paypal' && (
        <ImportPayPal
          batchId={batch.id}
          donors={donors}
          categories={categories}
          onDone={() => { setShowImport(null); loadBatch(); }}
          onClose={() => setShowImport(null)}
        />
      )}

      {showImport === 'zelle' && (
        <ImportZelle
          batchId={batch.id}
          donors={donors}
          categories={categories}
          onDone={() => { setShowImport(null); loadBatch(); }}
          onClose={() => setShowImport(null)}
        />
      )}

      {historyDonor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={closeHistory}>
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-start justify-between p-5 border-b border-gray-100">
              <div>
                <h3 className="font-semibold text-gray-900">{historyDonor.name}</h3>
                {historyData?.donor.envelopeNumber && (
                  <p className="text-xs text-gray-400 mt-0.5">Envelope #{historyData.donor.envelopeNumber}</p>
                )}
              </div>
              <button onClick={closeHistory} className="p-1 text-gray-400 hover:text-gray-600 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            {/* Year selector */}
            <div className="flex gap-1.5 px-5 pt-4">
              {(() => { const cur = new Date().getFullYear(); return [cur - 3, cur - 2, cur - 1, cur]; })().map((yr) => (
                <button
                  key={yr}
                  onClick={() => openDonorHistory(historyDonor.id, historyDonor.name, yr)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${historyYear === yr ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  {yr}
                </button>
              ))}
            </div>
            {/* Body */}
            <div className="overflow-y-auto flex-1 p-5 space-y-5">
              {historyLoading ? (
                <div className="text-center py-8 text-gray-400 text-sm">Loading…</div>
              ) : historyData ? (
                <>
                  {/* Grand total */}
                  <div className="bg-primary-50 rounded-lg px-4 py-3 flex items-baseline justify-between">
                    <span className="text-sm text-primary-700 font-medium">{historyYear} Total</span>
                    <span className="text-2xl font-bold text-primary-900 font-mono">{formatCurrency(historyData.grandTotal)}</span>
                  </div>
                  {/* By category */}
                  {Object.keys(historyData.totalsByCategory).length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">By Category</p>
                      <table className="w-full text-sm">
                        <tbody className="divide-y divide-gray-100">
                          {Object.entries(historyData.totalsByCategory).map(([cat, total]) => (
                            <tr key={cat}>
                              <td className="py-1.5 text-gray-700">{cat}</td>
                              <td className="py-1.5 text-right font-medium font-mono">{formatCurrency(total)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {/* Offerings list */}
                  {historyData.offerings.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Offerings</p>
                      <table className="w-full text-sm">
                        <tbody className="divide-y divide-gray-100">
                          {historyData.offerings.map((o, i) => (
                            <tr key={i}>
                              <td className="py-1.5 text-gray-500 whitespace-nowrap">{formatDate(o.date)}</td>
                              <td className="py-1.5 px-2"><span className="badge-gray">{paymentMethodLabel(o.paymentMethod)}</span></td>
                              <td className="py-1.5 text-gray-700">{o.category}</td>
                              <td className="py-1.5 text-right font-medium font-mono">{formatCurrency(o.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {historyData.offerings.length === 0 && (
                    <p className="text-center text-sm text-gray-400 py-4">No offerings in {historyYear}</p>
                  )}
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {reassignOffering && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h3 className="font-semibold text-lg mb-1">Reassign Offering</h3>
            <p className="text-sm text-gray-500 mb-4">
              Moving <span className="font-medium">{reassignOffering.donorLastName}, {reassignOffering.donorFirstName}</span>
              {' '}— {reassignOffering.categoryName} {formatCurrency(reassignOffering.amount)}
            </p>
            <label className="label">Target Batch</label>
            <select
              className="input mb-4"
              value={reassignBatchId}
              onChange={e => setReassignBatchId(e.target.value)}
            >
              <option value="">Select a batch…</option>
              {allBatches.map(b => (
                <option key={b.id} value={b.id}>
                  {formatDate(b.date)}{b.description ? ` — ${b.description}` : ''}
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setReassignOffering(null)} disabled={reassignSaving}>
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleReassign}
                disabled={!reassignBatchId || reassignSaving}
              >
                {reassignSaving ? 'Moving…' : 'Move'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
