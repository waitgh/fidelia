// Welcome / unlock screen: open a church file, create a new church, or try the demo.
// Everything happens in this browser; nothing is sent to a server.
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Loader2, AlertCircle, FolderOpen, PlusCircle, PlayCircle, KeyRound, Printer, Cloud, FileLock2 } from 'lucide-react';
import { useAuth } from '../lib/auth.js';
import { LogoMark } from '../components/Logo.js';
import { Church } from '../church/church';
import { MemoryAdapter } from '../storage/memory';
import { LocalFileAdapter } from '../storage/localFile';
import type { StorageAdapter } from '../storage/types';
import { seedDemo } from '../data/seed';
import { getRecent, setRecent, type RecentChurch } from '../storage/recent';
import { GoogleDriveAdapter } from '../storage/googleDrive';
import { DropboxAdapter, dropboxAppKey, hasDropboxSession, startDropboxSignIn, completeDropboxSignIn } from '../storage/dropbox';
import { getGoogleToken, googleClientId, startGoogleSignIn } from '../storage/googleAuth';

type DriveFile = { id: string; name: string; modifiedTime?: string };

/** Drive "Open with → Fidelia" lands on /?state={"ids":[...],"action":"open"}. */
function driveOpenRequest(): DriveFile | null {
  const raw = new URLSearchParams(location.search).get('state');
  if (raw) {
    history.replaceState(null, '', location.pathname);
    try {
      const st = JSON.parse(raw);
      if (st.action === 'open' && st.ids?.[0]) {
        const f = { id: String(st.ids[0]), name: 'Church file' };
        sessionStorage.setItem('fidelia.driveOpen', JSON.stringify(f));
        return f;
      }
    } catch { /* ignore */ }
  }
  try { return JSON.parse(sessionStorage.getItem('fidelia.driveOpen') ?? 'null'); } catch { return null; }
}

type Step =
  | { s: 'start' }
  | { s: 'drive'; files: DriveFile[] }
  | { s: 'dropbox'; files: { path: string; name: string; modified: string }[] }
  | { s: 'unlock'; adapter: StorageAdapter }
  | { s: 'recover'; adapter: StorageAdapter }
  | { s: 'claim'; church: Church }
  /** `getAdapter` runs only when the form is submitted, so backing out leaves nothing behind. */
  | { s: 'create'; label: string; getAdapter: () => Promise<StorageAdapter>; drive?: boolean }
  | { s: 'recoveryKey'; church: Church; key: string };

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-primary-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8 gap-3 print:hidden">
          <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center shadow-lg">
            <LogoMark size={40} />
          </div>
          <div className="flex items-baseline justify-center gap-2">
            <span className="text-2xl font-bold text-white tracking-tight" style={{ fontFamily: '"Playfair Display", Georgia, serif' }}>Fidelia</span>
            <span className="text-xl font-light text-yellow-300 tracking-wide" style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}>Ledger</span>
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow-xl p-7 space-y-5">{children}</div>
      </div>
    </div>
  );
}

const Title = ({ children }: { children: ReactNode }) => (
  <h2 className="text-xl font-semibold text-gray-900 text-center" style={{ fontFamily: '"Playfair Display", Georgia, serif' }}>{children}</h2>
);

function Field(p: { label: string; value: string; onChange: (v: string) => void; type?: string; autoComplete?: string; autoFocus?: boolean; hint?: string }) {
  return (
    <label className="block">
      <span className="label">{p.label}</span>
      <input className="input" type={p.type ?? 'text'} value={p.value} onChange={(e) => p.onChange(e.target.value)}
        autoComplete={p.autoComplete} autoFocus={p.autoFocus} required />
      {p.hint && <span className="block text-xs text-gray-500 mt-1">{p.hint}</span>}
    </label>
  );
}

function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (fn: () => Promise<void>) => {
    setError(''); setBusy(true);
    try { await fn(); } catch (e) { if ((e as Error).name !== 'AbortError') setError((e as Error).message); } finally { setBusy(false); }
  };
  return { busy, error, setError, run };
}

const ErrorBox = ({ error }: { error: string }) =>
  error ? (
    <div className="flex items-center gap-2 bg-red-50 text-red-700 px-3 py-2 rounded-lg text-sm">
      <AlertCircle className="h-4 w-4 shrink-0" />{error}
    </div>
  ) : null;

const Submit = ({ busy, children }: { busy: boolean; children: ReactNode }) => (
  <button type="submit" disabled={busy} className="btn-primary w-full py-2.5">
    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : children}
  </button>
);

const Back = ({ onClick }: { onClick: () => void }) => (
  <button type="button" onClick={onClick} className="text-sm text-gray-500 hover:text-gray-700 w-full text-center">Back</button>
);

export function Login() {
  const { enter } = useAuth();
  const [step, setStep] = useState<Step>({ s: 'start' });
  const a = useAction();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [churchName, setChurchName] = useState('');
  const [recoveryKey, setRecoveryKey] = useState('');
  const [saved, setSaved] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const fileSupported = LocalFileAdapter.supported();
  const [recent, setRecentState] = useState<RecentChurch | null>(null);
  useEffect(() => { void getRecent().then(setRecentState); }, []);
  const driveConfigured = !!googleClientId();

  const forgetRecent = () => { void setRecent(null); setRecentState(null); };

  /** Opens a Drive church file after checking it still exists (it may have been deleted in Drive). */
  const openDriveFile = (f: DriveFile) => a.run(async () => {
    const adapter = new GoogleDriveAdapter(f.id, f.name, getGoogleToken);
    if (!(await adapter.exists())) {
      if (recent?.kind === 'google-drive' && String(recent.ref) === f.id) forgetRecent();
      go({ s: 'start' });
      throw new Error('That church file is no longer in Google Drive (it was deleted or you lost access).');
    }
    go({ s: 'unlock', adapter });
  });

  /** Shows the Drive file list, signing in with Google first if needed (full-page redirect). */
  const openDrive = () => a.run(async () => {
    if (!getGoogleToken()) { startGoogleSignIn('/'); return; }
    const req = driveOpenRequest();
    if (req) { sessionStorage.removeItem('fidelia.driveOpen'); await openDriveFile(req); return; }
    go({ s: 'drive', files: await GoogleDriveAdapter.list(getGoogleToken) });
  });

  const dropboxConfigured = !!dropboxAppKey();
  const [newPath, setNewPath] = useState('/Fidelia/Church.fidelia');
  /** Drive folder for a new church; '' = top level of My Drive. */
  const [driveFolder, setDriveFolder] = useState('Fidelia');
  const [driveFileName, setDriveFileName] = useState('Church.fidelia');
  const openDropbox = () => a.run(async () => {
    if (!hasDropboxSession()) { sessionStorage.setItem('fidelia.resume', 'dropbox'); await startDropboxSignIn(); return; }
    const want = sessionStorage.getItem('fidelia.dropboxOpen');
    if (want) { sessionStorage.removeItem('fidelia.dropboxOpen'); go({ s: 'unlock', adapter: new DropboxAdapter(want) }); return; }
    go({ s: 'dropbox', files: await DropboxAdapter.list() });
  });

  // Resume after the Google redirect, or after Drive "Open with".
  useEffect(() => {
    if (sessionStorage.getItem('fidelia.resume') === 'dropbox') {
      sessionStorage.removeItem('fidelia.resume');
      void a.run(async () => { if (await completeDropboxSignIn()) await openDropbox(); });
      return;
    }
    const startupError = (window as any).__fideliaStartupError as string;
    if (startupError) { a.setError(startupError); return; }
    const resumed = sessionStorage.getItem('fidelia.resume') === 'google-drive';
    sessionStorage.removeItem('fidelia.resume');
    if (resumed || driveOpenRequest()) void openDrive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Remember where this church lives, then enter it. */
  const enterAndRemember = (church: Church) => {
    if (church.adapter instanceof LocalFileAdapter) {
      void setRecent({ kind: 'local-file', label: church.adapter.describe(), ref: church.adapter.fileHandle });
    } else if (church.adapter instanceof DropboxAdapter) {
      void setRecent({ kind: 'dropbox', label: church.adapter.describe(), ref: church.adapter.path });
    } else if (church.adapter instanceof GoogleDriveAdapter) {
      void setRecent({ kind: 'google-drive', label: church.adapter.describe(), ref: church.adapter.fileId });
    }
    enter(church);
  };

  const go = (s: Step) => { a.setError(''); setPassword(''); setPassword2(''); setStep(s); };

  const checkNewPassword = () => {
    if (password.length < 8) throw new Error('Password must be at least 8 characters');
    if (password !== password2) throw new Error('Passwords do not match');
  };

  if (step.s === 'start') {
    const Choice = (p: { icon: ReactNode; title: string; text: string; onClick: () => void; disabled?: boolean; onForget?: () => void }) => (
      <div className="relative">
        <button type="button" disabled={p.disabled || a.busy} onClick={p.onClick}
          className="w-full flex items-start gap-3 text-left rounded-xl border border-gray-200 p-4 hover:border-primary-400 hover:bg-primary-50 disabled:opacity-50">
          <span className="text-primary-600 mt-0.5">{p.icon}</span>
          <span className={p.onForget ? 'pr-14' : ''}><span className="block font-medium text-gray-900">{p.title}</span><span className="block text-sm text-gray-500">{p.text}</span></span>
        </button>
        {p.onForget && (
          <button type="button" onClick={p.onForget} title="Remove this shortcut from this browser"
            className="absolute top-3 right-3 text-xs text-gray-400 hover:text-gray-700 underline">Forget</button>
        )}
      </div>
    );
    return (
      <Shell>
        <Title>Welcome</Title>
        <ErrorBox error={a.error} />
        {recent?.kind === 'google-drive' && driveConfigured && (
          <Choice icon={<Cloud className="h-5 w-5" />} title={`Continue: ${recent.label}`} text="Open the church you used last time."
            onForget={forgetRecent}
            onClick={() => {
              const id = String(recent.ref);
              if (getGoogleToken()) openDriveFile({ id, name: recent.label.replace(/^Google Drive: /, '') });
              else { sessionStorage.setItem('fidelia.driveOpen', JSON.stringify({ id, name: recent.label.replace(/^Google Drive: /, '') })); startGoogleSignIn('/'); }
            }} />
        )}
        {recent?.kind === 'local-file' && fileSupported && (
          <Choice icon={<FolderOpen className="h-5 w-5" />} title={`Continue: ${recent.label}`} text="Open the church you used last time."
            onForget={forgetRecent}
            onClick={() => a.run(async () => go({ s: 'unlock', adapter: await LocalFileAdapter.fromHandle(recent.ref) }))} />
        )}
        {driveConfigured && (
          <Choice icon={<Cloud className="h-5 w-5" />} title="Google Drive" text="Open or set up a church file in your Google Drive. Works on iPhone." onClick={openDrive} />
        )}
        {recent?.kind === 'dropbox' && dropboxConfigured && (
          <Choice icon={<Cloud className="h-5 w-5" />} title={`Continue: ${recent.label}`} text="Open the church you used last time."
            onForget={forgetRecent}
            onClick={() => { sessionStorage.setItem('fidelia.dropboxOpen', String(recent.ref)); void openDropbox(); }} />
        )}
        {dropboxConfigured && (
          <Choice icon={<Cloud className="h-5 w-5" />} title="Dropbox" text="Open or set up a church file in your Dropbox." onClick={openDropbox} />
        )}
        <Choice icon={<FolderOpen className="h-5 w-5" />} title="Open church file" disabled={!fileSupported}
          text={fileSupported ? 'Open your church’s .fidelia file on this computer.' : 'Opening local files needs Chrome or Edge on a computer.'}
          onClick={() => a.run(async () => go({ s: 'unlock', adapter: await LocalFileAdapter.open() }))} />
        <Choice icon={<PlusCircle className="h-5 w-5" />} title="Set up a new church" disabled={!fileSupported}
          text="Create a new encrypted church file."
          onClick={() => a.run(async () => { const ad = await LocalFileAdapter.create(); go({ s: 'create', label: ad.describe(), getAdapter: async () => ad }); })} />
        <Choice icon={<PlayCircle className="h-5 w-5" />} title="Try the demo" text="Explore with sample data. Nothing is saved."
          onClick={() => a.run(async () => {
            const { church } = await Church.create(new MemoryAdapter(), { churchName: '', username: 'demo', displayName: 'Demo Admin', password: 'demo-password' });
            seedDemo(church.opened.db);
            await church.saveNow();
            enter(church);
          })} />
        <p className="text-xs text-gray-400 text-center">Your church data is encrypted in this browser. The people who run this website cannot read it.</p>
      </Shell>
    );
  }

  if (step.s === 'drive') {
    return (
      <Shell>
        <Title>Google Drive</Title>
        <ErrorBox error={a.error} />
        {step.files.length > 0 ? (
          <ul className="space-y-2">
            {step.files.map((f) => (
              <li key={f.id}>
                <button type="button" onClick={() => openDriveFile(f)} className="w-full flex items-center gap-3 rounded-xl border border-gray-200 p-3 text-left hover:border-primary-400 hover:bg-primary-50">
                  <FileLock2 className="h-5 w-5 text-primary-600" />
                  <span><span className="block font-medium">{f.name}</span>
                    {f.modifiedTime && <span className="block text-xs text-gray-500">Saved {new Date(f.modifiedTime).toLocaleString()}</span>}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-600">No church files yet. If someone shared the church file with you, open it in Google Drive and choose <b>Open with → Fidelia Ledger</b>.</p>
        )}
        <button type="button" className="btn-secondary w-full" disabled={a.busy}
          onClick={() => go({
            s: 'create', drive: true, label: 'Google Drive',
            getAdapter: async () => {
              const name = driveFileName.trim().replace(/\.fidelia$/i, '') + '.fidelia';
              const parent = driveFolder.trim() ? await GoogleDriveAdapter.ensureFolder(getGoogleToken, driveFolder.trim()) : undefined;
              return GoogleDriveAdapter.create(getGoogleToken, name, parent);
            },
          })}>
          <PlusCircle className="h-4 w-4" /> Set up a new church in Drive</button>
        <Back onClick={() => go({ s: 'start' })} />
      </Shell>
    );
  }

  if (step.s === 'dropbox') {
    return (
      <Shell>
        <Title>Dropbox</Title>
        <ErrorBox error={a.error} />
        {step.files.length ? (
          <ul className="space-y-2">
            {step.files.map((f) => (
              <li key={f.path}>
                <button type="button" onClick={() => go({ s: 'unlock', adapter: new DropboxAdapter(f.path) })}
                  className="w-full flex items-center gap-3 rounded-xl border border-gray-200 p-3 text-left hover:border-primary-400 hover:bg-primary-50">
                  <FileLock2 className="h-5 w-5 text-primary-600" />
                  <span><span className="block font-medium">{f.name}</span><span className="block text-xs text-gray-500">{f.path}</span></span>
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-gray-600">No church files found in your Dropbox.</p>}
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); const ad = new DropboxAdapter(newPath.endsWith('.fidelia') ? newPath : `${newPath}.fidelia`); go({ s: 'create', label: ad.describe(), getAdapter: async () => ad }); }}>
          <Field label="New church file location" value={newPath} onChange={setNewPath} />
          <button className="btn-secondary w-full"><PlusCircle className="h-4 w-4" /> Set up a new church in Dropbox</button>
        </form>
        <p className="text-xs text-gray-500">To let others in, share the folder with them in Dropbox, then add them under Members.</p>
        <Back onClick={() => go({ s: 'start' })} />
      </Shell>
    );
  }

  if (step.s === 'unlock') {
    const submit = (e: FormEvent) => { e.preventDefault(); a.run(async () => enterAndRemember(await Church.unlock(step.adapter, username, password))); };
    return (
      <Shell>
        <form onSubmit={submit} className="space-y-5">
          <Title>Sign in</Title>
          <p className="text-sm text-gray-500 text-center">{step.adapter.describe()}</p>
          <ErrorBox error={a.error} />
          <Field label="Sign-in name" value={username} onChange={setUsername} autoComplete="username" autoFocus />
          <Field label="Password" value={password} onChange={setPassword} type="password" autoComplete="current-password" />
          <Submit busy={a.busy}>Sign in</Submit>
          <button type="button" onClick={() => go({ s: 'recover', adapter: step.adapter })} className="text-sm text-primary-600 hover:underline w-full text-center">
            Forgot password? Use the recovery key
          </button>
          <Back onClick={() => go({ s: 'start' })} />
        </form>
      </Shell>
    );
  }

  if (step.s === 'recover') {
    const submit = (e: FormEvent) => { e.preventDefault(); a.run(async () => go({ s: 'claim', church: await Church.unlockWithRecoveryKey(step.adapter, recoveryKey) })); };
    return (
      <Shell>
        <form onSubmit={submit} className="space-y-5">
          <Title>Use recovery key</Title>
          <p className="text-sm text-gray-600">Enter the recovery key from your church’s printed recovery sheet. Another admin can also reset your password for you.</p>
          <ErrorBox error={a.error} />
          <Field label="Recovery key" value={recoveryKey} onChange={setRecoveryKey} autoFocus />
          <Submit busy={a.busy}><KeyRound className="h-4 w-4" /> Unlock</Submit>
          <Back onClick={() => go({ s: 'unlock', adapter: step.adapter })} />
        </form>
      </Shell>
    );
  }

  if (step.s === 'claim') {
    const submit = (e: FormEvent) => {
      e.preventDefault();
      a.run(async () => { checkNewPassword(); await step.church.claimAsAdmin(username, displayName, password); enterAndRemember(step.church); });
    };
    return (
      <Shell>
        <form onSubmit={submit} className="space-y-5">
          <Title>Set a new password</Title>
          <p className="text-sm text-gray-600">Unlocked. Choose your username and a new password. You will be an admin.</p>
          <ErrorBox error={a.error} />
          <Field label="Your full name" value={displayName} onChange={setDisplayName} hint="How others see you, e.g. in the Audit Log. Example: Grace Chen" autoFocus />
          <p className="pt-2 text-sm font-medium text-gray-700 border-t border-gray-100">Your sign-in</p>
          <Field label="Sign-in name" value={username} onChange={setUsername} autoComplete="username" hint="What you type to sign in. Short, no spaces. Example: grace" />
          <Field label="New password" value={password} onChange={setPassword} type="password" autoComplete="new-password" />
          <Field label="Repeat password" value={password2} onChange={setPassword2} type="password" autoComplete="new-password" />
          <Submit busy={a.busy}>Save and continue</Submit>
        </form>
      </Shell>
    );
  }

  if (step.s === 'create') {
    const submit = (e: FormEvent) => {
      e.preventDefault();
      a.run(async () => {
        checkNewPassword();
        const importBytes = importFile ? new Uint8Array(await importFile.arrayBuffer()) : undefined;
        const adapter = await step.getAdapter();
        let created;
        try {
          created = await Church.create(adapter, { churchName, username, displayName, password, importBytes });
        } catch (err) {
          if (adapter instanceof GoogleDriveAdapter) await adapter.discard().catch(() => {});
          throw err;
        }
        const { church, recoveryKey: key } = created;
        go({ s: 'recoveryKey', church, key });
      });
    };
    return (
      <Shell>
        <form onSubmit={submit} className="space-y-5">
          <Title>Set up your church</Title>
          <p className="text-sm text-gray-500 text-center">Saving to {step.label}</p>
          <ErrorBox error={a.error} />
          <Field label="Church name" value={churchName} onChange={setChurchName} autoFocus />
          {step.drive && (
            <fieldset className="rounded-lg border border-gray-200 p-3 space-y-2 text-sm">
              <legend className="px-1 text-gray-600">Where in your Google Drive</legend>
              <label className="flex items-center gap-2">
                <input type="radio" checked={driveFolder !== ''} onChange={() => setDriveFolder('Fidelia')} /> In a folder named
                <input className="input py-1 flex-1" value={driveFolder} disabled={driveFolder === ''} onChange={(e) => setDriveFolder(e.target.value)} />
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={driveFolder === ''} onChange={() => setDriveFolder('')} /> At the top of My Drive
              </label>
              <label className="flex items-center gap-2">File name
                <input className="input py-1 flex-1" value={driveFileName} onChange={(e) => setDriveFileName(e.target.value)} />
              </label>
              <p className="text-xs text-gray-500">You can move or rename the file in Drive later; the app will still find it. Don't copy or re-upload it.</p>
            </fieldset>
          )}
          <Field label="Your full name" value={displayName} onChange={setDisplayName} hint="How others see you, e.g. in the Audit Log. Example: Grace Chen" />
          <p className="pt-2 text-sm font-medium text-gray-700 border-t border-gray-100">Your sign-in</p>
          <Field label="Sign-in name" value={username} onChange={setUsername} autoComplete="username" hint="What you type to sign in. Short, no spaces. Example: grace" />
          <Field label="Password (8+ characters)" value={password} onChange={setPassword} type="password" autoComplete="new-password" />
          <Field label="Repeat password" value={password2} onChange={setPassword2} type="password" autoComplete="new-password" />
          <details className="text-sm">
            <summary className="cursor-pointer text-gray-600">Moving from the old Fidelia Ledger app?</summary>
            <div
              className="mt-2 rounded-lg border-2 border-dashed border-gray-300 p-3 text-center"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); setImportFile(e.dataTransfer.files[0] ?? null); }}
            >
              <p className="text-xs text-gray-500 mb-2">Drop the exported plain database here, or tap to choose it.</p>
              <input type="file" accept=".db,.sqlite,application/octet-stream" onChange={(e) => setImportFile(e.target.files?.[0] ?? null)} className="text-xs" />
              {importFile && <p className="text-xs text-green-700 mt-1">Will import {importFile.name}</p>}
            </div>
          </details>
          <p className="text-xs text-gray-500">There is no “forgot password” email. Keep your recovery key safe, and add a second admin soon.</p>
          <Submit busy={a.busy}>Create church</Submit>
          <Back onClick={() => go({ s: 'start' })} />
        </form>
      </Shell>
    );
  }

  // recoveryKey
  return (
    <Shell>
      <Title>Your recovery key</Title>
      <p className="text-sm text-gray-600">If every admin forgets their password, this key is the <b>only</b> way to open your church’s data. Print it and keep it somewhere safe, like the church office safe.</p>
      <div className="rounded-xl border-2 border-dashed border-gray-300 p-4 text-center">
        <p className="text-xs text-gray-500">{churchName || 'Church'} · Fidelia recovery key</p>
        <p className="font-mono text-lg tracking-wider text-gray-900 break-all mt-1">{step.key}</p>
      </div>
      <button type="button" onClick={() => window.print()} className="btn-secondary w-full print:hidden"><Printer className="h-4 w-4" /> Print</button>
      <label className="flex items-center gap-2 text-sm text-gray-700 print:hidden">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} /> I printed or saved the recovery key
      </label>
      <button type="button" disabled={!saved} onClick={() => enterAndRemember(step.church)} className="btn-primary w-full py-2.5 print:hidden">Continue</button>
    </Shell>
  );
}
