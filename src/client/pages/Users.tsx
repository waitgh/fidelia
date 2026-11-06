import { useState, useEffect, type FormEvent } from 'react';
import {
  UserPlus,
  Edit2,
  KeyRound,
  Trash2,
  Loader2,
  AlertCircle,
  Check,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';

interface UserRecord {
  id: number;
  username: string;
  displayName: string;
  role: string;
  createdAt: string;
}

type UserRole = 'admin' | 'bookkeeper' | 'viewer';

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'bookkeeper', label: 'Bookkeeper' },
  { value: 'viewer', label: 'Viewer' },
];

const ROLE_BADGE: Record<string, string> = {
  admin: 'bg-purple-100 text-purple-800',
  bookkeeper: 'bg-blue-100 text-blue-800',
  viewer: 'bg-gray-100 text-gray-800',
};

export function Users() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);
  const [resetTarget, setResetTarget] = useState<UserRecord | null>(null);
  const [error, setError] = useState('');

  const fetchUsers = async () => {
    try {
      const data = await api.users.list();
      setUsers(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleDelete = async (user: UserRecord) => {
    if (!confirm(`Delete user "${user.username}"? This cannot be undone.`)) return;
    try {
      await api.users.delete(user.id);
      fetchUsers();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
        <button
          onClick={() => {
            setShowForm(true);
            setEditingUser(null);
            setError('');
          }}
          className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
        >
          <UserPlus className="h-4 w-4" />
          Add User
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
          <button onClick={() => setError('')} className="ml-auto text-red-500 hover:text-red-700">
            &times;
          </button>
        </div>
      )}

      {showForm && (
        <UserForm
          user={editingUser}
          onSave={() => {
            setShowForm(false);
            setEditingUser(null);
            fetchUsers();
          }}
          onCancel={() => {
            setShowForm(false);
            setEditingUser(null);
          }}
        />
      )}

      {resetTarget && (
        <ResetPasswordForm
          user={resetTarget}
          onDone={() => setResetTarget(null)}
        />
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">
                Username
              </th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">
                Display Name
              </th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">
                Role
              </th>
              <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="px-6 py-4 text-sm font-medium text-gray-900">{u.username}</td>
                <td className="px-6 py-4 text-sm text-gray-600">{u.displayName}</td>
                <td className="px-6 py-4">
                  <span
                    className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${ROLE_BADGE[u.role] ?? ROLE_BADGE.viewer}`}
                  >
                    {u.role.charAt(0).toUpperCase() + u.role.slice(1)}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => {
                        setEditingUser(u);
                        setShowForm(true);
                        setError('');
                      }}
                      className="p-1.5 text-gray-400 hover:text-primary-600 rounded"
                      title="Edit user"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setResetTarget(u)}
                      className="p-1.5 text-gray-400 hover:text-amber-600 rounded"
                      title="Reset password"
                    >
                      <KeyRound className="h-4 w-4" />
                    </button>
                    {u.id !== currentUser?.id && (
                      <button
                        onClick={() => handleDelete(u)}
                        className="p-1.5 text-gray-400 hover:text-red-600 rounded"
                        title="Delete user"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UserForm({
  user,
  onSave,
  onCancel,
}: {
  user: UserRecord | null;
  onSave: () => void;
  onCancel: () => void;
}) {
  const isEdit = !!user;
  const [username, setUsername] = useState(user?.username ?? '');
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<UserRole>((user?.role as UserRole) ?? 'viewer');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isEdit && password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (isEdit) {
        await api.users.update(user!.id, { displayName, role });
      } else {
        await api.users.create({ username, displayName, password, role });
      }
      onSave();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        {isEdit ? 'Edit User' : 'New User'}
      </h2>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 text-red-700 px-3 py-2 rounded-lg text-sm mb-4">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={isEdit}
            required={!isEdit}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none disabled:bg-gray-100"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
          />
        </div>
        {!isEdit && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                placeholder="Min 6 characters"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none ${
                  confirmPassword && confirmPassword !== password
                    ? 'border-red-300 bg-red-50'
                    : 'border-gray-300'
                }`}
                placeholder="Re-enter password"
              />
              {confirmPassword && confirmPassword !== password && (
                <p className="mt-1 text-xs text-red-600">Passwords do not match</p>
              )}
            </div>
          </>
        )}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
          >
            {ROLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {isEdit ? 'Save Changes' : 'Create User'}
          </button>
        </div>
      </form>
    </div>
  );
}

function ResetPasswordForm({ user, onDone }: { user: UserRecord; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const mismatch = confirmPassword !== '' && confirmPassword !== password;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.users.resetPassword(user.id, password);
      setSuccess(true);
      setTimeout(onDone, 1500);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
      <h3 className="text-sm font-semibold text-amber-800 mb-3">
        Reset password for <span className="font-bold">{user.username}</span>
      </h3>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 text-red-700 px-3 py-2 rounded-lg text-sm mb-3">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {success ? (
        <div className="flex items-center gap-2 text-green-700 text-sm">
          <Check className="h-4 w-4" />
          Password reset successfully.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-amber-700 mb-1">New Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-3 py-2 border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none text-sm"
                placeholder="Min 6 characters"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-amber-700 mb-1">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none text-sm ${
                  mismatch ? 'border-red-300 bg-red-50' : 'border-amber-300'
                }`}
                placeholder="Re-enter password"
              />
              {mismatch && (
                <p className="mt-1 text-xs text-red-600">Passwords do not match</p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving || mismatch}
              className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Reset Password'}
            </button>
            <button
              type="button"
              onClick={onDone}
              className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
