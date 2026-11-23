// Church members: each has their own password slot on the encrypted file.
// Roles are enforced in the UI only (there is no server).
import type { DropboxAdapter } from '../storage/dropbox';
import { useState, type FormEvent } from 'react';
import { UserPlus, KeyRound, Trash2, Loader2, Mail, Copy, X } from 'lucide-react';
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
  /** Invite panel: choosing a role, then showing the new code once. */
  const [invite, setInvite] = useState<{ role: Role; code?: string } | null>(null);
  if (!church) return null;
  const invites = church.listInvites();
  const where = church.adapter.kind === 'google-drive'
    ? { share: 'In Google Drive, share the church file with their Google account (as Editor, or Viewer for viewers).', find: 'Sign in → Google Drive → Find it in Google Drive' }
    : church.adapter.kind === 'dropbox'
      ? { share: `In Dropbox, share the folder ${(church.adapter as DropboxAdapter).folder} with their email address (they can use a free Dropbox account). Leave “Can edit” on, even for viewers: Fidelia itself keeps viewers read-only. Then they must click “Join folder” in Dropbox’s invitation email (or at dropbox.com → Shared → Join) so the folder is in their own Dropbox.`, find: 'Sign in → Dropbox' }
      : { share: 'Give them a copy of the church file, or put it somewhere you both can reach.', find: 'Sign in → A file on this computer' };
  const members = church.listMembers().filter((m) => m.isActive);
  const admins = members.filter((m) => m.role === 'admin' && m.hasPassword).length;
  /** Members (e.g. imported from the old app) who can't sign in until someone sets their password. */
  const noPassword = members.filter((m) => !m.hasPassword);
  const adminsNoPassword = noPassword.filter((m) => m.role === 'admin');

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
        <button className="btn-primary" onClick={() => { setForm(null); setInvite({ role: 'bookkeeper' }); }}>
          <Mail className="h-4 w-4" /> Invite someone
        </button>
      </div>
      {admins < 2 && (
        <div className="card p-4 bg-amber-50 border-amber-200 text-amber-900 text-sm">
          {adminsNoPassword.length > 0
            ? <>Set a password for {adminsNoPassword.map((m) => m.displayName).join(', ')} so {adminsNoPassword.length > 1 ? 'they' : 'this admin'} can sign in (use the key button on their row). Until then you’re the only admin who can get in, and if you forget your password the church needs the printed recovery key.</>
            : <>Add a second admin. If the only admin forgets their password, the church needs the printed recovery key to get back in.</>}
        </div>
      )}
      {noPassword.length > 0 && admins >= 2 && (
        <div className="card p-4 bg-gray-50 text-gray-700 text-sm">
          {noPassword.map((m) => m.displayName).join(', ')} can’t sign in yet. Set a password with the key button on their row.
        </div>
      )}
      {error && <div className="card p-3 bg-red-50 text-red-700 text-sm">{error}</div>}
      {invite && !invite.code && (
        <div className="card p-5 space-y-4">
          <p className="text-sm text-gray-600">You get a one-time code. They use it to choose their own sign-in name and password. It works once, for 14 days.</p>
          <label className="block max-w-md"><span className="label">They will be</span>
            <select className="input" value={invite.role} onChange={(e) => setInvite({ role: e.target.value as Role })}>
              {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label} — {r.help}</option>)}
            </select></label>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" disabled={busy} onClick={() => act(async () => { const code = await church.createInvite(invite.role); setInvite({ ...invite, code }); })}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create invite code'}</button>
            <button className="btn-secondary" onClick={() => setInvite(null)}>Cancel</button>
            <button type="button" className="btn-ghost text-sm" onClick={() => { setInvite(null); setForm({ username: '', displayName: '', role: 'bookkeeper', password: '', editing: false }); }}>
              <UserPlus className="h-4 w-4" /> Or set their password yourself</button>
          </div>
        </div>
      )}
      {invite?.code && (
        <div className="card p-5 space-y-4 border-primary-200">
          <div className="flex items-start justify-between">
            <h2 className="font-semibold">Invite code for a new {invite.role}</h2>
            <button className="btn-ghost btn-sm" title="Close" onClick={() => setInvite(null)}><X className="h-4 w-4" /></button>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-mono text-xl tracking-wider bg-gray-50 border border-gray-200 rounded-lg px-4 py-2">{invite.code}</span>
            <button className="btn-secondary btn-sm" onClick={() => void navigator.clipboard?.writeText(invite.code!)}><Copy className="h-4 w-4" /> Copy</button>
          </div>
          <ol className="list-decimal pl-5 text-sm text-gray-700 space-y-1">
            <li>{where.share}</li>
            <li>Send them this code (text or email is fine; it works once and expires in 14 days).</li>
            <li>They open Fidelia and choose <b>{where.find}</b>, then <b>I have an invite code</b>.</li>
          </ol>
          <p className="text-xs text-gray-500">You won’t see this code again. If it gets lost, revoke it below and create a new one. They can’t finish joining while you’re signed in and editing, so sign out once you’ve sent it.</p>
        </div>
      )}
      {form && (
        <form onSubmit={submit} className="card p-5 grid gap-4 sm:grid-cols-2">
          <label><span className="label">Sign-in name <span className="font-normal text-gray-400">(what they type to sign in)</span></span>
            <input className="input" value={form.username} disabled={form.editing} required onChange={(e) => setForm({ ...form, username: e.target.value })} /></label>
          <label><span className="label">Full name <span className="font-normal text-gray-400">(how others see them)</span></span>
            <input className="input" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} /></label>
          <label><span className="label">Role</span>
            <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label} — {r.help}</option>)}
            </select></label>
          <label><span className="label">{form.editing ? 'New password' : 'Temporary password'} (8+ characters)</span>
            <input className="input" type="text" autoComplete="off" value={form.password} required onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
          <p className="sm:col-span-2 text-xs text-gray-500">Tell them the password in person or by phone, and ask them to change it under Data &amp; Backup after signing in. They also need access to the church file. An invite code is usually easier.</p>
          <div className="sm:col-span-2 flex gap-2">
            <button className="btn-primary" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}</button>
            <button type="button" className="btn-secondary" onClick={() => setForm(null)}>Cancel</button>
          </div>
        </form>
      )}
      {invites.length > 0 && (
        <div className="card p-4">
          <h2 className="text-sm font-medium text-gray-700 mb-2">Invites not used yet</h2>
          <ul className="divide-y divide-gray-100 text-sm">
            {invites.map((i) => (
              <li key={i.id} className="flex items-center justify-between py-2">
                <span>{ROLES.find((r) => r.value === i.role)?.label ?? i.role} · {i.expired ? <span className="text-red-600">expired</span> : `expires ${new Date(i.expires).toLocaleDateString()}`}</span>
                <button className="btn-ghost btn-sm text-red-600" disabled={busy} onClick={() => act(() => church.revokeInvite(i.id))}>Revoke</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="table-container">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-gray-500"><th className="p-3">Full name</th><th className="p-3">Sign-in name</th><th className="p-3">Role</th><th className="p-3" /></tr></thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.username} className="border-t border-gray-100">
                <td className="p-3 font-medium">{m.displayName}</td>
                <td className="p-3 text-gray-600">{m.username}
                  {!m.hasPassword && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">No password yet</span>}</td>
                <td className="p-3">
                  <select className="input py-1" value={m.role} disabled={busy || m.username === user?.username}
                    onChange={(e) => act(() => church.updateMemberRole(m.username, e.target.value as Role))}>
                    {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </td>
                <td className="p-3 text-right whitespace-nowrap">
                  <button className="btn-ghost btn-sm" title={m.hasPassword ? 'Reset password' : 'Set password'} onClick={() => setForm({ ...m, password: '', editing: true })}><KeyRound className="h-4 w-4" /></button>
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
