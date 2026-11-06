import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { ArrowLeft, Plus, Save, X } from 'lucide-react';
import { SortableHeader, toggleSort, type SortState } from '../components/SortableHeader.js';

type CategorySortColumn = 'name' | 'description' | 'status';

interface Category {
  id: number;
  name: string;
  description: string | null;
  isActive: boolean;
}

export function Categories() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [sort, setSort] = useState<SortState<CategorySortColumn>>({ column: 'name', direction: 'asc' });
  const [hideInactive, setHideInactive] = useState(() => localStorage.getItem('categories:hideInactive') === 'true');

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

  useEffect(() => {
    loadCategories();
  }, []);

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
      <div className="page-header">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/settings')} className="btn-ghost btn-sm">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="page-title">Fund Categories</h1>
        </div>
        {!showForm && (
          <button onClick={() => setShowForm(true)} className="btn-primary">
            <Plus className="h-4 w-4" />
            Add Category
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="card p-6 mb-6 max-w-lg">
          <h3 className="text-lg font-semibold mb-4">{editingId ? 'Edit Category' : 'New Category'}</h3>
          <div className="space-y-4">
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

      <div className="card">
        <div className="flex items-center justify-end px-4 pt-3 pb-1">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
            <div
              role="switch"
              aria-checked={hideInactive}
              tabIndex={0}
              onClick={() => { const next = !hideInactive; setHideInactive(next); localStorage.setItem('categories:hideInactive', String(next)); }}
              onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); const next = !hideInactive; setHideInactive(next); localStorage.setItem('categories:hideInactive', String(next)); } }}
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
                <SortableHeader
                  label="Name"
                  column="name"
                  current={sort}
                  onSort={(col) => setSort(toggleSort(sort, col))}
                />
                <SortableHeader
                  label="Description"
                  column="description"
                  current={sort}
                  onSort={(col) => setSort(toggleSort(sort, col))}
                />
                <SortableHeader
                  label="Status"
                  column="status"
                  current={sort}
                  onSort={(col) => setSort(toggleSort(sort, col))}
                />
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
