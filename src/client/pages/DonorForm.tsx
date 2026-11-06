import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { ArrowLeft, Save, Trash2 } from 'lucide-react';
import { DonorOtherNameLabel } from '../../shared/types/enums.js';
import { useSettings } from '../lib/settings.js';

interface FormData {
  firstName: string;
  lastName: string;
  spouseName: string;
  chineseName: string;
  congregation: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  envelopeNumber: string;
  notes: string;
  isActive: boolean;
}

const EMPTY_FORM: FormData = {
  firstName: '',
  lastName: '',
  spouseName: '',
  chineseName: '',
  congregation: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  state: '',
  zipCode: '',
  envelopeNumber: '',
  notes: '',
  isActive: true,
};

export function DonorForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditing = Boolean(id);
  const { congregationOptions } = useSettings();

  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState('');
  const [envelopeTaken, setEnvelopeTaken] = useState(false);

  useEffect(() => {
    if (id) {
      api.donors.get(Number(id)).then((donor) => {
        setForm({
          firstName: donor.firstName ?? '',
          lastName: donor.lastName ?? '',
          spouseName: donor.spouseName ?? '',
          chineseName: donor.chineseName ?? '',
          congregation: donor.congregation ?? '',
          email: donor.email ?? '',
          phone: donor.phone ?? '',
          address: donor.address ?? '',
          city: donor.city ?? '',
          state: donor.state ?? '',
          zipCode: donor.zipCode ?? '',
          envelopeNumber: donor.envelopeNumber ?? '',
          notes: donor.notes ?? '',
          isActive: donor.isActive ?? true,
        });
      });
    }
  }, [id]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, type } = e.target;
    const value = type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
    setForm((prev) => ({ ...prev, [name]: value }));

    if (name === 'envelopeNumber' && typeof value === 'string' && value) {
      api.donors.checkEnvelope(value, id ? Number(id) : undefined).then((r) => {
        setEnvelopeTaken(r.taken);
      });
    } else if (name === 'envelopeNumber') {
      setEnvelopeTaken(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      const data = {
        ...form,
        spouseName: form.spouseName || null,
        chineseName: form.chineseName || null,
        congregation: form.congregation || null,
        email: form.email || null,
        phone: form.phone || null,
        address: form.address || null,
        city: form.city || null,
        state: form.state || null,
        zipCode: form.zipCode || null,
        envelopeNumber: form.envelopeNumber || null,
        notes: form.notes || null,
      };

      if (isEditing) {
        await api.donors.update(Number(id), data);
      } else {
        await api.donors.create(data);
      }
      navigate(-1);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!isEditing || !id) return;

    setError('');
    setDeleting(true);
    try {
      await api.donors.delete(Number(id));
      navigate(-1);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete donor');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="btn-ghost btn-sm">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="page-title">{isEditing ? 'Edit Donor' : 'New Donor'}</h1>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="card p-6 max-w-2xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 [&_.input]:h-9">
          <div>
            <label className="label">First Name *</label>
            <input name="firstName" className="input" required value={form.firstName} onChange={handleChange} />
          </div>
          <div>
            <label className="label">Last Name *</label>
            <input name="lastName" className="input" required value={form.lastName} onChange={handleChange} />
          </div>
          <div>
            <label className="label">Spouse Name</label>
            <input name="spouseName" className="input" value={form.spouseName} onChange={handleChange} />
          </div>
          <div>
            <label className="label">{DonorOtherNameLabel}</label>
            <input name="chineseName" className="input" value={form.chineseName} onChange={handleChange} />
          </div>
          <div>
            <label className="label">Email</label>
            <input name="email" type="email" className="input" value={form.email} onChange={handleChange} />
          </div>
          <div>
            <label className="label">Phone</label>
            <input name="phone" className="input" value={form.phone} onChange={handleChange} />
          </div>
          <div>
            <label className="label">Congregation</label>
            <select name="congregation" className="input" value={form.congregation} onChange={handleChange}>
              <option value="">Select...</option>
              {congregationOptions.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Envelope Number</label>
            <input
              name="envelopeNumber"
              className={`input ${envelopeTaken ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
              value={form.envelopeNumber}
              onChange={handleChange}
            />
            {envelopeTaken && (
              <p className="text-red-600 text-xs mt-1">This envelope number is already in use</p>
            )}
          </div>
        </div>

        <h3 className="text-sm font-semibold text-gray-700 mb-3">Address</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="md:col-span-2">
            <label className="label">Street Address</label>
            <input name="address" className="input" value={form.address} onChange={handleChange} />
          </div>
          <div>
            <label className="label">City</label>
            <input name="city" className="input" value={form.city} onChange={handleChange} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">State</label>
              <input name="state" className="input" value={form.state} onChange={handleChange} />
            </div>
            <div>
              <label className="label">ZIP Code</label>
              <input name="zipCode" className="input" value={form.zipCode} onChange={handleChange} />
            </div>
          </div>
        </div>

        <div className="mb-6">
          <label className="label">Notes</label>
          <textarea name="notes" className="input min-h-[80px]" value={form.notes} onChange={handleChange} />
        </div>

        {isEditing && (
          <div className="mb-6">
            <label className="flex items-center gap-2 cursor-pointer w-fit">
              <input
                type="checkbox"
                name="isActive"
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 h-4 w-4"
                checked={form.isActive}
                onChange={handleChange}
              />
              <span className="text-sm font-medium text-gray-700">Active</span>
            </label>
            {!form.isActive && (
              <p className="mt-1 text-xs text-amber-600">This donor is inactive and will be hidden from default lists.</p>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <div className="flex gap-3">
            <button type="submit" className="btn-primary" disabled={saving || envelopeTaken}>
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : isEditing ? 'Update Donor' : 'Create Donor'}
            </button>
            <button type="button" onClick={() => navigate(-1)} className="btn-secondary" disabled={saving || deleting}>
              Cancel
            </button>
          </div>
          {isEditing && (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="btn-danger"
              disabled={saving || deleting}
            >
              <Trash2 className="h-4 w-4" />
              {deleting ? 'Deleting...' : 'Delete Donor'}
            </button>
          )}
        </div>
      </form>

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowDeleteConfirm(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-2">Confirm Delete</h3>
            <p className="text-sm text-gray-600 mb-5">
              Permanently delete this donor? This cannot be undone. Donors with recorded offerings or pledges
              cannot be deleted — mark them inactive instead.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={async () => {
                  setShowDeleteConfirm(false);
                  await handleDelete();
                }}
                disabled={deleting}
              >
                <Trash2 className="h-4 w-4" />
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
