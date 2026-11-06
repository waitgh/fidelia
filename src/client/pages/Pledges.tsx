import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { formatCurrency, formatDate } from '../lib/formatters.js';
import { DonorPicker } from '../components/DonorPicker.js';
import { Plus, Trash2, Pencil, Save, X } from 'lucide-react';

interface PledgeRow {
  id: number;
  donorId: number;
  categoryId: number;
  amount: number;
  startDate: string;
  endDate: string;
  notes: string | null;
  donorFirstName: string;
  donorLastName: string;
  donorSpouseName: string | null;
  categoryName: string;
  givenAmount: number;
  fulfillmentPct: number;
}

interface DonorOption {
  id: number;
  firstName: string;
  lastName: string;
  spouseName: string | null;
  envelopeNumber: string | null;
}

interface CategoryOption {
  id: number;
  name: string;
  isActive?: boolean;
}

export function Pledges() {
  const [pledges, setPledges] = useState<PledgeRow[]>([]);
  const [donors, setDonors] = useState<DonorOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [filterYear, setFilterYear] = useState(String(new Date().getFullYear()));
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState('');

  const [donorId, setDonorId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [startDate, setStartDate] = useState(`${new Date().getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(`${new Date().getFullYear()}-12-31`);
  const [notes, setNotes] = useState('');

  const loadPledges = () => {
    const params: Record<string, string> = {};
    if (filterYear) params.year = filterYear;
    api.pledges.list(params).then(setPledges).catch(console.error);
  };

  useEffect(() => {
    loadPledges();
  }, [filterYear]);

  useEffect(() => {
    api.donors.list().then(setDonors);
    api.categories.list().then(setCategories);
  }, []);

  const resetForm = () => {
    setDonorId('');
    setCategoryId('');
    setAmount('');
    setStartDate(`${new Date().getFullYear()}-01-01`);
    setEndDate(`${new Date().getFullYear()}-12-31`);
    setNotes('');
    setEditingId(null);
    setError('');
  };

  const startEdit = (p: PledgeRow) => {
    setEditingId(p.id);
    setDonorId(String(p.donorId));
    setCategoryId(String(p.categoryId));
    setAmount(String(p.amount));
    setStartDate(p.startDate);
    setEndDate(p.endDate);
    setNotes(p.notes ?? '');
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const data = {
        donorId: Number(donorId),
        categoryId: Number(categoryId),
        amount: parseFloat(amount),
        startDate,
        endDate,
        notes: notes || null,
      };

      if (editingId) {
        await api.pledges.update(editingId, data);
      } else {
        await api.pledges.create(data);
      }
      resetForm();
      setShowForm(false);
      loadPledges();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save pledge');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this pledge?')) return;
    try {
      await api.pledges.delete(id);
      loadPledges();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete');
    }
  };

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  const totalPledged = pledges.reduce((s, p) => s + p.amount, 0);
  const totalGiven = pledges.reduce((s, p) => s + p.givenAmount, 0);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Pledges</h1>
        <div className="flex items-center gap-3">
          <select
            className="input w-auto"
            value={filterYear}
            onChange={(e) => setFilterYear(e.target.value)}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          {!showForm && (
            <button onClick={() => { resetForm(); setShowForm(true); }} className="btn-primary">
              <Plus className="h-4 w-4" />
              New Pledge
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="stat-card">
          <p className="stat-label">Total Pledged</p>
          <p className="text-2xl font-bold text-gray-900 font-mono">{formatCurrency(totalPledged)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Total Given</p>
          <p className="text-2xl font-bold text-gray-900 font-mono">{formatCurrency(totalGiven)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Overall Fulfillment</p>
          <p className="text-2xl font-bold text-gray-900">
            {totalPledged > 0 ? Math.round((totalGiven / totalPledged) * 100) : 0}%
          </p>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">{editingId ? 'Edit Pledge' : 'New Pledge'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="lg:col-span-2">
              <label className="label">Donor *</label>
              <DonorPicker donors={donors} value={donorId} onChange={setDonorId} required />
            </div>
            <div>
              <label className="label">Category *</label>
              <select className="input" required value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">Select...</option>
                {categories
                  .filter((c) => c.isActive !== false)
                  .map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
              </select>
            </div>
            <div>
              <label className="label">Pledged Amount *</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                className="input"
                required
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Start Date *</label>
              <input
                type="date"
                className="input"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <label className="label">End Date *</label>
              <input
                type="date"
                className="input"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
          <div className="mt-4 flex gap-3">
            <button type="submit" className="btn-primary btn-sm">
              <Save className="h-4 w-4" />
              {editingId ? 'Update Pledge' : 'Create Pledge'}
            </button>
            <button type="button" onClick={() => { resetForm(); setShowForm(false); }} className="btn-secondary btn-sm">
              <X className="h-4 w-4" />
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Donor</th>
                <th>Category</th>
                <th>Period</th>
                <th className="text-right">Pledged</th>
                <th className="text-right">Given</th>
                <th>Progress</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pledges.map((p) => (
                <tr key={p.id}>
                  <td className="font-medium text-gray-900">
                    {p.donorLastName}, {p.donorFirstName}
                    {p.donorSpouseName && <span className="text-gray-400"> & {p.donorSpouseName}</span>}
                  </td>
                  <td>{p.categoryName}</td>
                  <td className="text-sm text-gray-500">
                    {formatDate(p.startDate)} — {formatDate(p.endDate)}
                  </td>
                  <td className="text-right font-medium font-mono">{formatCurrency(p.amount)}</td>
                  <td className="text-right font-medium font-mono">{formatCurrency(p.givenAmount)}</td>
                  <td className="min-w-[140px]">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-100 rounded-full h-2.5">
                        <div
                          className={`h-2.5 rounded-full transition-all ${
                            p.fulfillmentPct >= 100
                              ? 'bg-green-500'
                              : p.fulfillmentPct >= 50
                                ? 'bg-primary-500'
                                : p.fulfillmentPct >= 25
                                  ? 'bg-yellow-500'
                                  : 'bg-red-400'
                          }`}
                          style={{ width: `${Math.min(p.fulfillmentPct, 100)}%` }}
                        />
                      </div>
                      <span className={`text-xs font-medium w-10 text-right ${
                        p.fulfillmentPct >= 100 ? 'text-green-600' : 'text-gray-500'
                      }`}>
                        {p.fulfillmentPct}%
                      </span>
                    </div>
                  </td>
                  <td className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => startEdit(p)}
                        className="btn-ghost btn-sm text-primary-600"
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(p.id)}
                        className="btn-ghost btn-sm text-red-600"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {pledges.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-gray-400">
                    No pledges for {filterYear}
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
