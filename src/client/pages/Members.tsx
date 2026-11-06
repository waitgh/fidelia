// Church members: each has their own password slot on the encrypted file.
// Roles are enforced in the UI only (there is no server).
import { useState, type FormEvent } from 'react';
import { UserPlus, KeyRound, Trash2, Loader2 } from 'lucide-react';
import { useAuth } from '../lib/auth';
import type { Role } from '../church/church';

const ROLES: { value: Role; label: string; help: string }[] = [
  { value: 'admin', label: 'Admin', help: 'Everything, including members and recovery key' },
  { value: 'bookkeeper', label: 'Bookkeeper', help: 'Enter and edit offerings, donors, pledges' },
  { value: 'viewer', label: 'Viewer', help: 'Read-only dashboards, batches and reports' },
];

export function Members() {
  const { church, user } = useAuth();
  const [, force] = useState(0);
  const [form, setForm] = useState<{ username: string; displayName: string; role: Role; password: string; editing: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!church) return null;
  const members = church.listMembers().filter((m) => m.isActive);
  const admins = members.filter((m) => m.role === 'admin' && m.hasPassword).length;

  const act = async (fn: () => Promise<void>) => {
    setError(''); setBusy(true);
    try { await fn(); force((n) => n + 1); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    act(async () => {
      await church.setMember({ username: form.username, displayName: form.displayName, role: form.role }, form.password);
      setForm(null);
    });
  };

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">Members</h1>
        <button className="btn-primary" onClick={() => setForm({ username: '', displayName: '', role: 'bookkeeper', password: '', editing: false })}>
          <UserPlus className="h-4 w-4" /> Add member
        </button>
      </div>
      {admins < 2 && (
        <div className="card p-4 bg-amber-50 border-amber-200 text-amber-900 text-sm">
          Add a second admin. If the only admin forgets their password, the church needs the printed recovery key to get back in.
        </div>
      )}
      {error && <div className="card p-3 bg-red-50 text-red-700 text-sm">{error}</div>}
      {form && (
        <form onSubmit={submit} className="card p-5 grid gap-4 sm:grid-cols-2">
          <label><span className="label">Username</span>
            <input className="input" value={form.username} disabled={form.editing} required onChange={(e) => setForm({ ...form, username: e.target.value })} /></label>
          <label><span className="label">Name</span>
            <input className="input" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} /></label>
          <label><span className="label">Role</span>
            <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label} — {r.help}</option>)}
            </select></label>
          <label><span className="label">{form.editing ? 'New password' : 'Temporary password'} (8+ characters)</span>
            <input className="input" type="text" autoComplete="off" value={form.password} required onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
          <p className="sm:col-span-2 text-xs text-gray-500">Tell them the password in person or by phone, and ask them to change it under Data &amp; Backup after signing in. They also need access to the church file (shared folder or a copy).</p>
          <div className="sm:col-span-2 flex gap-2">
            <button className="btn-primary" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}</button>
            <button type="button" className="btn-secondary" onClick={() => setForm(null)}>Cancel</button>
          </div>
        </form>
      )}
      <div className="table-container">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-gray-500"><th className="p-3">Name</th><th className="p-3">Username</th><th className="p-3">Role</th><th className="p-3" /></tr></thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.username} className="border-t border-gray-100">
                <td className="p-3 font-medium">{m.displayName}</td>
                <td className="p-3 text-gray-600">{m.username}</td>
                <td className="p-3">
                  <select className="input py-1" value={m.role} disabled={busy || m.username === user?.username}
                    onChange={(e) => act(() => church.updateMemberRole(m.username, e.target.value as Role))}>
                    {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </td>
                <td className="p-3 text-right whitespace-nowrap">
                  <button className="btn-ghost btn-sm" title="Reset password" onClick={() => setForm({ ...m, password: '', editing: true })}><KeyRound className="h-4 w-4" /></button>
                  {m.username !== user?.username && (
                    <button className="btn-ghost btn-sm text-red-600" title="Remove" disabled={busy}
                      onClick={() => window.confirm(`Remove ${m.displayName}? They will no longer be able to open the church file.`) && act(() => church.removeMember(m.username))}>
                      <Trash2 className="h-4 w-4" /></button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
