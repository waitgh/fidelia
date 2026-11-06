import { useState, useEffect, useRef, useMemo } from 'react';
import { useSettings } from '../lib/settings.js';
import { api } from '../lib/api.js';
import { Save, Plus, Trash2, GripVertical, Tag, Church, CreditCard, X, Building2 } from 'lucide-react';
import { SortableHeader, toggleSort, type SortState } from '../components/SortableHeader.js';

const TABS = [
  { id: 'organization', label: 'Organization', icon: Building2 },
  { id: 'categories', label: 'Fund Categories', icon: Tag },
  { id: 'congregations', label: 'Congregations', icon: Church },
  { id: 'methods', label: 'Offering Methods', icon: CreditCard },
] as const;

type TabId = (typeof TABS)[number]['id'];

type CategorySortColumn = 'name' | 'description' | 'status';

interface Category {
  id: number;
  name: string;
  description: string | null;
  isActive: boolean;
}

/* ------------------------------------------------------------------ */
/*  Categories panel                                                   */
/* ------------------------------------------------------------------ */
function CategoriesPanel() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [sort, setSort] = useState<SortState<CategorySortColumn>>({ column: 'name', direction: 'asc' });
  const [hideInactive, setHideInactive] = useState(
    () => localStorage.getItem('categories:hideInactive') === 'true',
  );

  const sortedCategories = useMemo(() => {
    const list = hideInactive ? categories.filter((c) => c.isActive) : [...categories];
    const dir = sort.direction === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      switch (sort.column) {
        case 'name':
          return a.name.localeCompare(b.name) * dir;
        case 'description':
          return (a.description ?? '').localeCompare(b.description ?? '') * dir;
        case 'status': {
          const av = a.isActive ? 0 : 1;
          const bv = b.isActive ? 0 : 1;
          return (av - bv) * dir;
        }
        default:
          return 0;
      }
    });
    return list;
  }, [categories, sort, hideInactive]);

  const loadCategories = () => {
    api.categories.list().then(setCategories).catch(console.error);
  };

  useEffect(() => { loadCategories(); }, []);

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setName('');
    setDescription('');
    setError('');
  };

  const startEdit = (cat: Category) => {
    setEditingId(cat.id);
    setName(cat.name);
    setDescription(cat.description ?? '');
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (editingId) {
        await api.categories.update(editingId, { name, description: description || null });
      } else {
        await api.categories.create({ name, description: description || null });
      }
      resetForm();
      loadCategories();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    }
  };

  const toggleActive = async (cat: Category) => {
    try {
      await api.categories.update(cat.id, { isActive: !cat.isActive });
      loadCategories();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to update');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">
          Manage offering categories (General, Building, Missions, etc.)
        </p>
        {!showForm && (
          <button onClick={() => setShowForm(true)} className="btn-primary btn-sm">
            <Plus className="h-4 w-4" />
            Add Category
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-gray-50 border border-gray-200 rounded-lg p-5 mb-5 max-w-lg">
          <h3 className="text-base font-semibold mb-3">{editingId ? 'Edit Category' : 'New Category'}</h3>
          <div className="space-y-3">
            <div>
              <label className="label">Name *</label>
              <input className="input" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="label">Description</label>
              <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button type="submit" className="btn-primary btn-sm">
              <Save className="h-4 w-4" />
              {editingId ? 'Update' : 'Create'}
            </button>
            <button type="button" onClick={resetForm} className="btn-secondary btn-sm">
              <X className="h-4 w-4" />
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="flex items-center justify-end px-4 pt-3 pb-1">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
            <div
              role="switch"
              aria-checked={hideInactive}
              tabIndex={0}
              onClick={() => {
                const next = !hideInactive;
                setHideInactive(next);
                localStorage.setItem('categories:hideInactive', String(next));
              }}
              onKeyDown={(e) => {
                if (e.key === ' ' || e.key === 'Enter') {
                  e.preventDefault();
                  const next = !hideInactive;
                  setHideInactive(next);
                  localStorage.setItem('categories:hideInactive', String(next));
                }
              }}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                hideInactive ? 'bg-primary-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                  hideInactive ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </div>
            Hide inactive
          </label>
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <SortableHeader label="Name" column="name" current={sort} onSort={(col) => setSort(toggleSort(sort, col))} />
                <SortableHeader label="Description" column="description" current={sort} onSort={(col) => setSort(toggleSort(sort, col))} />
                <SortableHeader label="Status" column="status" current={sort} onSort={(col) => setSort(toggleSort(sort, col))} />
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedCategories.map((cat) => (
                <tr key={cat.id}>
                  <td className="font-medium text-gray-900">{cat.name}</td>
                  <td className="text-gray-500">{cat.description ?? '—'}</td>
                  <td>
                    <span className={cat.isActive ? 'badge-green' : 'badge-gray'}>
                      {cat.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => startEdit(cat)} className="btn-ghost btn-sm w-16 justify-center">
                        Edit
                      </button>
                      <button
                        onClick={() => toggleActive(cat)}
                        className="btn-ghost btn-sm text-gray-500 w-24 justify-center"
                      >
                        {cat.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {sortedCategories.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center py-8 text-gray-400">
                    No categories yet
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

/* ------------------------------------------------------------------ */
/*  Organization panel                                                 */
/* ------------------------------------------------------------------ */
function OrganizationPanel() {
  const { churchName, churchAddress1, churchCity, churchState, churchZip, churchPhone, letterSigningName, letterSigningTitle, loading, reload } = useSettings();
  const [form, setForm] = useState({
    churchName: '', churchAddress1: '', churchCity: '', churchState: '', churchZip: '', churchPhone: '', letterSigningName: '', letterSigningTitle: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const initialized = useRef(false);
  useEffect(() => {
    if (loading || initialized.current) return;
    initialized.current = true;
    setForm({ churchName, churchAddress1, churchCity, churchState, churchZip, churchPhone, letterSigningName, letterSigningTitle });
  }, [loading, churchName, churchAddress1, churchCity, churchState, churchZip, churchPhone, letterSigningName, letterSigningTitle]);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const save = async () => {
    setError('');
    setSaving(true);
    try {
      await Promise.all([
        api.settings.update('churchName', form.churchName),
        api.settings.update('churchAddress1', form.churchAddress1),
        api.settings.update('churchCity', form.churchCity),
        api.settings.update('churchState', form.churchState),
        api.settings.update('churchZip', form.churchZip),
        api.settings.update('churchPhone', form.churchPhone),
        api.settings.update('letterSigningName', form.letterSigningName),
        api.settings.update('letterSigningTitle', form.letterSigningTitle),
      ]);
      await reload();
      setSuccess('Organization settings saved');
      setTimeout(() => setSuccess(''), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-lg">
      <p className="text-sm text-gray-500 mb-6">
        Your organization's name and contact details used in donor letters and app branding.
      </p>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
      {success && <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">{success}</div>}

      <div className="space-y-4">
        <div>
          <label className="label">Organization Name</label>
          <input className="input" value={form.churchName} onChange={set('churchName')} placeholder="e.g. First Community Church" />
        </div>
        <div>
          <label className="label">Street Address</label>
          <input className="input" value={form.churchAddress1} onChange={set('churchAddress1')} placeholder="123 Main St" />
        </div>
        <div className="grid grid-cols-5 gap-3">
          <div className="col-span-2">
            <label className="label">City</label>
            <input className="input" value={form.churchCity} onChange={set('churchCity')} placeholder="Springfield" />
          </div>
          <div>
            <label className="label">State</label>
            <input className="input" value={form.churchState} onChange={set('churchState')} placeholder="VA" maxLength={2} />
          </div>
          <div className="col-span-2">
            <label className="label">Zip Code</label>
            <input className="input" value={form.churchZip} onChange={set('churchZip')} placeholder="22041" />
          </div>
        </div>
        <div>
          <label className="label">Phone</label>
          <input className="input" value={form.churchPhone} onChange={set('churchPhone')} placeholder="(000) 000-0000" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Letter Signing Title</label>
            <input className="input" value={form.letterSigningTitle} onChange={set('letterSigningTitle')} placeholder="e.g. Treasurer" />
          </div>
          <div>
            <label className="label">Letter Signing Name</label>
            <input className="input" value={form.letterSigningName} onChange={set('letterSigningName')} placeholder="e.g. Jane Smith" />
          </div>
        </div>
      </div>

      <button type="button" onClick={save} className="btn-primary btn-sm mt-6" disabled={saving}>
        <Save className="h-4 w-4" />
        {saving ? 'Saving...' : 'Save'}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Congregations panel                                                */
/* ------------------------------------------------------------------ */
function CongregationsPanel() {
  const { congregationOptions, reload } = useSettings();
  const [congregations, setCongregations] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    setCongregations([...congregationOptions]);
  }, [congregationOptions]);

  const save = async () => {
    const filtered = congregations.map((c) => c.trim()).filter(Boolean);
    if (filtered.length === 0) {
      setError('At least one congregation is required');
      return;
    }
    setError('');
    setSaving(true);
    try {
      await api.settings.update('congregationOptions', filtered);
      await reload();
      setSuccess('Congregation options saved');
      setTimeout(() => setSuccess(''), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">
        Options shown in the congregation dropdown on donor forms and reports.
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">{success}</div>
      )}

      <div className="space-y-2 mb-4 max-w-lg">
        {congregations.map((c, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <GripVertical className="h-4 w-4 text-gray-300 shrink-0" />
            <input
              className="input flex-1"
              value={c}
              onChange={(e) => {
                const next = [...congregations];
                next[idx] = e.target.value;
                setCongregations(next);
              }}
              placeholder="Congregation name"
            />
            {congregations.length > 1 && (
              <button
                type="button"
                onClick={() => setCongregations(congregations.filter((_, i) => i !== idx))}
                className="btn-ghost btn-sm text-red-500"
                title="Remove"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => setCongregations([...congregations, ''])}
          className="btn-secondary btn-sm"
        >
          <Plus className="h-4 w-4" />
          Add
        </button>
        <button
          type="button"
          onClick={save}
          className="btn-primary btn-sm"
          disabled={saving}
        >
          <Save className="h-4 w-4" />
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Offering methods panel                                             */
/* ------------------------------------------------------------------ */
function toValueKey(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, '_');
}

function OfferingMethodsPanel() {
  const { offeringMethodOptions, reload } = useSettings();
  const [labels, setLabels] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    setLabels(offeringMethodOptions.map((m) => m.label));
  }, [offeringMethodOptions]);

  const save = async () => {
    const filtered = labels.map((l) => l.trim()).filter(Boolean);
    if (filtered.length === 0) {
      setError('At least one offering method is required');
      return;
    }
    const keys = filtered.map(toValueKey);
    if (new Set(keys).size !== keys.length) {
      setError('Offering method names must be unique');
      return;
    }
    setError('');
    setSaving(true);
    try {
      await api.settings.update(
        'offeringMethodOptions',
        filtered.map((label) => ({ value: toValueKey(label), label })),
      );
      await reload();
      setSuccess('Offering method options saved');
      setTimeout(() => setSuccess(''), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">
        Payment methods available when recording offerings (e.g. Check, Cash, Online).
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">{success}</div>
      )}

      <div className="space-y-2 mb-4 max-w-lg">
        {labels.map((label, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <GripVertical className="h-4 w-4 text-gray-300 shrink-0" />
            <input
              className="input flex-1"
              value={label}
              onChange={(e) => {
                const next = [...labels];
                next[idx] = e.target.value;
                setLabels(next);
              }}
              placeholder="Method name"
            />
            {labels.length > 1 && (
              <button
                type="button"
                onClick={() => setLabels(labels.filter((_, i) => i !== idx))}
                className="btn-ghost btn-sm text-red-500"
                title="Remove"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => setLabels([...labels, ''])}
          className="btn-secondary btn-sm"
        >
          <Plus className="h-4 w-4" />
          Add
        </button>
        <button
          type="button"
          onClick={save}
          className="btn-primary btn-sm"
          disabled={saving}
        >
          <Save className="h-4 w-4" />
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Settings page with tabs                                            */
/* ------------------------------------------------------------------ */
export function Settings() {
  const [activeTab, setActiveTab] = useState<TabId>('organization');

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
      </div>

      {/* Tab bar */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-6" aria-label="Settings sections">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === id
                  ? 'border-primary-600 text-primary-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Panel content */}
      <div className="card p-6">
        {activeTab === 'organization' && <OrganizationPanel />}
        {activeTab === 'categories' && <CategoriesPanel />}
        {activeTab === 'congregations' && <CongregationsPanel />}
        {activeTab === 'methods' && <OfferingMethodsPanel />}
      </div>
    </div>
  );
}
