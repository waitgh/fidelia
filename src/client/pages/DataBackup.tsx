// Where the church file lives, save status, previous versions, password and recovery key.
import { useEffect, useState, type FormEvent } from 'react';
import { Save, Download, History, KeyRound, Printer, Loader2 } from 'lucide-react';
import { useAuth } from '../lib/auth';
import type { StoredVersion } from '../storage/types';

const STATE_LABEL = { saved: 'All changes saved', dirty: 'Unsaved changes…', saving: 'Saving…', error: 'Save failed' };

export function DataBackup() {
  const { church, user, saveState, enter } = useAuth();
  const [versions, setVersions] = useState<StoredVersion[]>([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState({ a: '', b: '' });
  const [newKey, setNewKey] = useState('');

  useEffect(() => { church?.adapter.listVersions().then(setVersions).catch(() => setVersions([])); }, [church, saveState]);
  if (!church) return null;
  const isAdmin = user?.role === 'admin';

  const act = async (fn: () => Promise<string | void>) => {
    setMsg(''); setBusy(true);
    try { const m = await fn(); if (m) setMsg(m); } catch (e) { setMsg(`Error: ${(e as Error).message}`); } finally { setBusy(false); }
  };

  const download = () => act(async () => {
    await church.saveNow();
    const bytes = await church.adapter.load();
    if (!bytes) throw new Error('Nothing saved yet');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/octet-stream' }));
    a.download = `church-backup-${new Date().toISOString().slice(0, 10)}.fidelia`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    return 'Encrypted backup downloaded. It opens with the same passwords and recovery key.';
  });

  const changePw = (e: FormEvent) => {
    e.preventDefault();
    act(async () => {
      if (pw.a.length < 8) throw new Error('Password must be at least 8 characters');
      if (pw.a !== pw.b) throw new Error('Passwords do not match');
      await church.changeOwnPassword(pw.a);
      setPw({ a: '', b: '' });
      return 'Password changed.';
    });
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="page-title">Data &amp; Backup</h1>
      {msg && <div className={`card p-3 text-sm ${msg.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-800'}`}>{msg}</div>}

      <section className="card p-5 space-y-3">
        <h2 className="serif-heading text-lg">Church file</h2>
        <p className="text-sm text-gray-600">Location: <b>{church.adapter.describe()}</b></p>
        <p className="text-sm">Status: <span className={saveState === 'error' ? 'text-red-600 font-medium' : 'text-gray-700'}>{STATE_LABEL[saveState]}</span>
          {saveState === 'error' && church.lastError ? ` — ${(church.lastError as Error).message}` : ''}</p>
        {church.opened.readOnly && <p className="text-sm text-amber-700">This file was saved by a newer version of Fidelia. Reload the page to update; until then it is read-only.</p>}
        <div className="flex flex-wrap gap-2">
          {!church.readOnly && <button className="btn-secondary" disabled={busy} onClick={() => act(async () => { await church.saveNow(); return 'Saved.'; })}><Save className="h-4 w-4" /> Save now</button>}
          <button className="btn-secondary" disabled={busy} onClick={download}><Download className="h-4 w-4" /> Download encrypted backup</button>
        </div>
      </section>

      {isAdmin && (
        <section className="card p-5 space-y-3">
          <h2 className="serif-heading text-lg flex items-center gap-2"><History className="h-5 w-5" /> Previous versions</h2>
          {versions.length === 0 ? <p className="text-sm text-gray-500">No previous versions yet.</p> : (
            <ul className="divide-y divide-gray-100 text-sm">
              {versions.map((v) => (
                <li key={v.id} className="py-2 flex items-center justify-between">
                  <span>{new Date(v.savedAt).toLocaleString()} <span className="text-gray-400">· {Math.round(v.size / 1024)} KB</span></span>
                  <button className="btn-ghost btn-sm" disabled={busy || church.readOnly}
                    onClick={() => window.confirm('Restore this version? Changes made after it will be replaced (they stay in the version history).') &&
                      act(async () => { await church.restoreVersion(v.id); enter(church); return 'Version restored.'; })}>Restore</button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {user && (
        <form onSubmit={changePw} className="card p-5 space-y-3">
          <h2 className="serif-heading text-lg flex items-center gap-2"><KeyRound className="h-5 w-5" /> Change my password</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <input className="input" type="password" placeholder="New password" autoComplete="new-password" value={pw.a} onChange={(e) => setPw({ ...pw, a: e.target.value })} />
            <input className="input" type="password" placeholder="Repeat" autoComplete="new-password" value={pw.b} onChange={(e) => setPw({ ...pw, b: e.target.value })} />
          </div>
          <button className="btn-primary" disabled={busy || church.opened.readOnly}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Change password'}</button>
        </form>
      )}

      {isAdmin && (
        <section className="card p-5 space-y-3">
          <h2 className="serif-heading text-lg">Recovery key</h2>
          <p className="text-sm text-gray-600">Lost the printed recovery key? Make a new one. The old key stops working.</p>
          {newKey ? (
            <div className="rounded-xl border-2 border-dashed border-gray-300 p-4 text-center">
              <p className="font-mono text-lg tracking-wider break-all">{newKey}</p>
              <button className="btn-secondary mt-3 print:hidden" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</button>
            </div>
          ) : (
            <button className="btn-secondary" disabled={busy || church.readOnly}
              onClick={() => window.confirm('Create a new recovery key? The old one will stop working.') && act(async () => { setNewKey(await church.rotateRecoveryKey()); })}>
              New recovery key</button>
          )}
        </section>
      )}
    </div>
  );
}
