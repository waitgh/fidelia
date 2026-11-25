// Welcome screen: sign in, or create a church account (and choose where its data lives).
// Everything happens in this browser; nothing is sent to a server.
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Lock, Loader2, AlertCircle, FolderOpen, KeyRound, Printer, Cloud, FileLock2, LogIn, UserPlus, HardDrive } from 'lucide-react';
import { useAuth } from '../lib/auth.js';
import { LogoMark } from '../components/Logo.js';
import { Church } from '../church/church';
import { MemoryAdapter } from '../storage/memory';
import { LocalFileAdapter } from '../storage/localFile';
import type { StorageAdapter } from '../storage/types';
import { seedDemo } from '../data/seed';
import { StayInTouchLink } from '../components/StayInTouch';
import { ABOUT_URL, FAQ_URL, GUIDE_URL } from '../lib/links';
import { getRecent, setRecent, type RecentChurch } from '../storage/recent';
import { GoogleDriveAdapter } from '../storage/googleDrive';
import { DropboxAdapter, dropboxAppKey, hasDropboxSession, startDropboxSignIn, switchDropboxAccount, completeDropboxSignIn, joinPath, parentOf } from '../storage/dropbox';
import { DropboxBrowser } from '../components/DropboxBrowser';
import { getGoogleToken, googleClientId, startGoogleSignIn } from '../storage/googleAuth';
import { openDrivePicker, pickerConfigured, takePickResult } from '../storage/drivePicker';

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

type Where = 'drive' | 'dropbox' | 'local';

type Step =
  | { s: 'start' }
  /** Sign in: where is the church's data? */
  | { s: 'signinWhere' }
  | { s: 'drive'; files: DriveFile[] }
  | { s: 'dropbox'; files: { path: string; name: string; modified: string }[]; notice?: string }
  | { s: 'unlock'; adapter: StorageAdapter }
  | { s: 'recover'; adapter: StorageAdapter }
  | { s: 'claim'; church: Church }
  /** New member: enter the invite code from an admin, then choose a sign-in. */
  | { s: 'invite'; adapter: StorageAdapter }
  | { s: 'join'; church: Church }
  /** Create account, step 1: church and person. */
  | { s: 'create' }
  /** Create account, step 2: where to keep the data. */
  | { s: 'createWhere' }
  /** Create account, step 3: password. `getAdapter` runs only on submit, so backing out leaves nothing behind. */
  | { s: 'createPassword'; label: string; getAdapter: () => Promise<StorageAdapter> }
  | { s: 'recoveryKey'; church: Church; key: string };

/** Non-secret create-account answers kept across the Google/Dropbox sign-in redirect. Never holds the password. */
const PENDING_CREATE = 'fidelia.pendingCreate';
type Folder = { id: string; name: string };
type PendingCreate = { churchName: string; displayName: string; username: string; where: Where; driveFolder: string; driveFileName: string; dropboxPath: string; pickedFolder: Folder | null };

function Shell({ children, intro }: { children: ReactNode; intro?: boolean }) {
  return (
    <div className="min-h-screen bg-primary-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className={`flex flex-col items-center gap-3 print:hidden ${intro ? 'mb-6' : 'mb-8'}`}>
          <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center shadow-lg">
            <LogoMark size={40} />
          </div>
          <div className="flex items-baseline justify-center gap-2">
            <span className="text-2xl font-bold text-white tracking-tight" style={{ fontFamily: '"Playfair Display", Georgia, serif' }}>Fidelia</span>
            <span className="text-xl font-light text-yellow-300 tracking-wide" style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}>Ledger</span>
          </div>
          {intro && (
            <div className="mt-3 text-center">
              <p className="text-2xl sm:text-[1.7rem] font-bold text-white leading-snug [text-wrap:balance]">Offering and donor records for your church</p>
              <p className="mt-3 text-primary-100 leading-relaxed [text-wrap:balance]">
                <Lock className="inline h-4 w-4 -mt-1 mr-1.5 text-yellow-300" />
                Encrypted on your own computer and kept in your church’s own Dropbox. <strong className="text-white">We never see your data.</strong>
              </p>
              <p className="mt-2 text-sm text-primary-300">Free · Nothing to install · <a href={ABOUT_URL} className="text-yellow-300 hover:text-yellow-200 underline-offset-2 hover:underline">See how it works →</a></p>
            </div>
          )}
        </div>
        <div className="bg-white rounded-2xl shadow-xl p-7 space-y-5">{children}</div>
        <nav className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-primary-200 print:hidden">
          <a href={ABOUT_URL} className="hover:text-white">About</a>
          <a href={FAQ_URL} className="hover:text-white">FAQ</a>
          <a href={GUIDE_URL} target="_blank" rel="noopener noreferrer" className="hover:text-white">User guide</a>
          <StayInTouchLink className="hover:text-white">Stay in touch</StayInTouchLink>
        </nav>
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

const StepLabel = ({ n }: { n: number }) => <p className="text-xs text-gray-400 text-center -mt-3">Step {n} of 3</p>;

function Option(p: { icon: ReactNode; title: string; text: string; onClick: () => void; disabled?: boolean; selected?: boolean; children?: ReactNode }) {
  return (
    <div className={`rounded-xl border ${p.selected ? 'border-primary-500 bg-primary-50' : 'border-gray-200'}`}>
      <button type="button" disabled={p.disabled} onClick={p.onClick}
        className="w-full flex items-start gap-3 text-left p-4 rounded-xl hover:bg-primary-50 disabled:opacity-50">
        <span className="text-primary-600 mt-0.5">{p.icon}</span>
        <span><span className="block font-medium text-gray-900">{p.title}</span><span className="block text-sm text-gray-500">{p.text}</span></span>
      </button>
      {p.selected && p.children && <div className="px-4 pb-4 space-y-2 text-sm">{p.children}</div>}
    </div>
  );
}

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
  const driveConfigured = !!googleClientId();
  const dropboxConfigured = !!dropboxAppKey();
  const [recent, setRecentState] = useState<RecentChurch | null>(null);
  useEffect(() => { void getRecent().then(setRecentState); }, []);
  /** The remembered church, if this browser can still open it. */
  const usableRecent = recent && (
    (recent.kind === 'google-drive' && driveConfigured) || (recent.kind === 'dropbox' && dropboxConfigured) || (recent.kind === 'local-file' && fileSupported)
  ) ? recent : null;

  // Create-account choices.
  const [where, setWhere] = useState<Where | null>(null);
  /** Drive folder for a new church; '' = top level of My Drive. */
  const [driveFolder, setDriveFolder] = useState('Fidelia');
  const [driveFileName, setDriveFileName] = useState('Church.fidelia');
  const [dropboxPath, setDropboxPath] = useState('/Fidelia/Church.fidelia');
  const [dropboxManual, setDropboxManual] = useState('');
  /** Which in-app Dropbox browser is open: choosing a folder for a new church, or finding a church file. */
  const [browse, setBrowse] = useState<null | 'create' | 'signin'>(null);
  /** Folder chosen in the Google Picker; null = top of My Drive. */
  const [pickedFolder, setPickedFolder] = useState<Folder | null>(null);
  const canPick = driveConfigured && pickerConfigured();

  /** Set by “Different church”: always show the list of church files instead of opening the only one found. Survives the sign-in redirect. */
  const CHOOSE = 'fidelia.chooseChurch';
  const choosing = () => sessionStorage.getItem(CHOOSE) === '1';
  const chooseDifferentChurch = () => { sessionStorage.setItem(CHOOSE, '1'); go({ s: 'signinWhere' }); };
  const forgetRecent = () => { void setRecent(null); setRecentState(null); };
  const go = (s: Step) => { a.setError(''); setPassword(''); setPassword2(''); setBrowse(null); if (s.s === 'start') sessionStorage.removeItem(CHOOSE); setStep(s); };

  /** Opens a Drive church file after checking it still exists (it may have been deleted in Drive). */
  const openDriveFile = (f: DriveFile) => a.run(async () => {
    const adapter = new GoogleDriveAdapter(f.id, f.name, getGoogleToken);
    if (!(await adapter.exists())) {
      if (recent?.kind === 'google-drive' && String(recent.ref) === f.id) forgetRecent();
      go({ s: 'start' });
      throw new Error('That church file is no longer in Google Drive (it was deleted or moved to the trash).');
    }
    go({ s: 'unlock', adapter });
  });

  /** Sign in via Google Drive: finds the church file, signing in with Google first if needed (full-page redirect). */
  const openDrive = () => a.run(async () => {
    if (!getGoogleToken()) { startGoogleSignIn('/'); return; }
    const req = driveOpenRequest();
    if (req) { sessionStorage.removeItem('fidelia.driveOpen'); await openDriveFile(req); return; }
    const files = await GoogleDriveAdapter.list(getGoogleToken);
    if (files.length === 1 && !choosing()) { await openDriveFile(files[0]!); return; }
    go({ s: 'drive', files });
  });

  const openDropbox = () => a.run(async () => {
    if (!hasDropboxSession()) { sessionStorage.setItem('fidelia.resume', 'dropbox'); await startDropboxSignIn(); return; }
    const want = sessionStorage.getItem('fidelia.dropboxOpen');
    if (want) {
      sessionStorage.removeItem('fidelia.dropboxOpen');
      const ad = new DropboxAdapter(want);
      if (await ad.exists()) { go({ s: 'unlock', adapter: ad }); return; }
      // Moved, renamed, or no longer shared with this account: look for it again.
      if (recent?.kind === 'dropbox' && String(recent.ref) === want) forgetRecent();
      go({ s: 'dropbox', files: await DropboxAdapter.list(), notice: `The church file is no longer at ${want}. Choose it below.` });
      return;
    }
    const files = await DropboxAdapter.list();
    if (files.length === 1 && !choosing()) { go({ s: 'unlock', adapter: new DropboxAdapter(files[0]!.path) }); return; }
    go({ s: 'dropbox', files });
  });

  /** Sign in to the church this browser used last time. */
  const openRecent = (r: RecentChurch) => {
    if (r.kind === 'google-drive') {
      const f = { id: String(r.ref), name: r.label.replace(/^Google Drive: /, '') };
      if (getGoogleToken()) void openDriveFile(f);
      else { sessionStorage.setItem('fidelia.driveOpen', JSON.stringify(f)); startGoogleSignIn('/'); }
    } else if (r.kind === 'dropbox') {
      sessionStorage.setItem('fidelia.dropboxOpen', String(r.ref)); void openDropbox();
    } else {
      void a.run(async () => go({ s: 'unlock', adapter: await LocalFileAdapter.fromHandle(r.ref) }));
    }
  };

  /** `folder` is a picked folder, a folder name to find/create, or '' for the top of My Drive. */
  const driveCreateStep = (folder: Folder | string, fileName: string): Step => {
    const name = fileName.trim().replace(/\.fidelia$/i, '') + '.fidelia';
    const folderName = typeof folder === 'string' ? folder.trim() : folder.name;
    return {
      s: 'createPassword',
      label: `Google Drive: ${folderName ? `${folderName}/` : ''}${name}`,
      getAdapter: async () => {
        const parent = typeof folder !== 'string' ? folder.id
          : folderName ? await GoogleDriveAdapter.ensureFolder(getGoogleToken, folderName) : undefined;
        if (await GoogleDriveAdapter.findByName(getGoogleToken, name, parent)) {
          throw new Error(`There is already a file named ${name} in ${folderName || 'My Drive'}. To use that church, go back to the first page and sign in. To start a new church, go back and choose another file name.`);
        }
        return GoogleDriveAdapter.create(getGoogleToken, name, parent);
      },
    };
  };
  const driveFolderChoice = (p: { driveFolder: string; pickedFolder: Folder | null }) => p.pickedFolder ?? p.driveFolder;
  const dropboxCreateStep = (path: string): Step => {
    const ad = new DropboxAdapter(path.endsWith('.fidelia') ? path : `${path}.fidelia`);
    return { s: 'createPassword', label: ad.describe(), getAdapter: async () => ad };
  };

  /** Restores create-account answers after a Google/Dropbox sign-in redirect. */
  const resumeCreate = (): PendingCreate | null => {
    let p: PendingCreate | null = null;
    try { p = JSON.parse(sessionStorage.getItem(PENDING_CREATE) ?? 'null'); } catch { /* ignore */ }
    sessionStorage.removeItem(PENDING_CREATE);
    if (!p) return null;
    setChurchName(p.churchName); setDisplayName(p.displayName); setUsername(p.username);
    setWhere(p.where); setDriveFolder(p.driveFolder); setDriveFileName(p.driveFileName); setDropboxPath(p.dropboxPath); setPickedFolder(p.pickedFolder ?? null);
    return p;
  };

  // Resume after a Google/Dropbox redirect, or after Drive "Open with".
  useEffect(() => {
    // Back from the Google Picker page.
    const picked = takePickResult();
    if (picked) {
      if (picked.mode === 'folder' && picked.id && picked.isFolder === false) {
        // Picked an existing church file while looking for a folder: open that church instead.
        resumeCreate();
        void openDriveFile({ id: picked.id, name: picked.name ?? 'Church file' }).then(() =>
          a.setError(`${picked.name ?? 'That file'} is an existing church, so it’s opened here. Sign in below, or go back to create a different church.`));
        return;
      }
      if (picked.mode === 'folder') {
        const p = resumeCreate();
        if (picked.id) setPickedFolder({ id: picked.id, name: picked.name ?? 'Chosen folder' });
        setWhere('drive');
        setStep(p ? { s: 'createWhere' } : { s: 'create' });
      } else if (picked.id) {
        void openDriveFile({ id: picked.id, name: picked.name ?? 'Church file' });
      } else setStep({ s: 'signinWhere' });
      if (picked.error) a.setError(picked.error);
      return;
    }
    const resume = sessionStorage.getItem('fidelia.resume');
    sessionStorage.removeItem('fidelia.resume');
    const startupError = (window as any).__fideliaStartupError as string;
    if (startupError) { a.setError(startupError); return; }
    if (resume === 'dropbox') {
      void a.run(async () => {
        if (!(await completeDropboxSignIn())) return;
        const p = resumeCreate();
        const browseAfter = sessionStorage.getItem('fidelia.dropboxBrowse');
        sessionStorage.removeItem('fidelia.dropboxBrowse');
        if (p?.where === 'dropbox' && browseAfter === 'create') { go({ s: 'createWhere' }); setBrowse('create'); } // after go(), which closes it
        else if (p?.where === 'dropbox') go(dropboxCreateStep(p.dropboxPath));
        else await openDropbox();
      });
      return;
    }
    if (resume === 'google-drive') {
      const p = resumeCreate();
      if (p?.where === 'drive' && getGoogleToken()) { go(driveCreateStep(driveFolderChoice(p), p.driveFileName)); return; }
    }
    if (resume === 'google-drive' || driveOpenRequest()) void openDrive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Remember where this church lives, then enter it. */
  const enterAndRemember = (church: Church) => {
    sessionStorage.removeItem(CHOOSE);
    if (church.adapter instanceof LocalFileAdapter) {
      void setRecent({ kind: 'local-file', label: church.adapter.describe(), ref: church.adapter.fileHandle });
    } else if (church.adapter instanceof DropboxAdapter) {
      void setRecent({ kind: 'dropbox', label: church.adapter.describe(), ref: church.adapter.path });
    } else if (church.adapter instanceof GoogleDriveAdapter) {
      void setRecent({ kind: 'google-drive', label: church.adapter.describe(), ref: church.adapter.fileId });
    }
    enter(church);
  };

  const checkNewPassword = () => {
    if (password.length < 8) throw new Error('Password must be at least 8 characters');
    if (password !== password2) throw new Error('Passwords do not match');
  };

  const startDemo = () => a.run(async () => {
    const { church } = await Church.create(new MemoryAdapter(), { churchName: '', username: 'demo', displayName: 'Demo Admin', password: 'demo-password' });
    seedDemo(church.opened.db);
    await church.saveNow();
    enter(church);
  });

  // "Try the demo" links on the About/FAQ pages open /?demo. Drop the flag from the address
  // first (so StrictMode's second run and a later refresh don't start it again), then start.
  useEffect(() => {
    const url = new URL(location.href);
    if (!url.searchParams.has('demo')) return;
    url.searchParams.delete('demo');
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);
    startDemo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (step.s === 'start') {
    return (
      <Shell intro>
        <Title>Welcome</Title>
        <ErrorBox error={a.error} />
        <button type="button" className="btn-primary w-full py-2.5" disabled={a.busy}
          onClick={() => (usableRecent ? openRecent(usableRecent) : go({ s: 'signinWhere' }))}>
          {a.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><LogIn className="h-4 w-4" /> Sign in</>}
        </button>
        {usableRecent && (
          <p className="text-xs text-gray-500 text-center -mt-2">
            {usableRecent.label} ·{' '}
            <button type="button" className="underline hover:text-gray-700" onClick={chooseDifferentChurch}>Different church</button> ·{' '}
            <button type="button" className="underline hover:text-gray-700" onClick={forgetRecent} title="Stop remembering this church in this browser">Forget</button>
          </p>
        )}
        <button type="button" className="btn-secondary w-full py-2.5" disabled={a.busy} onClick={() => go({ s: 'create' })}>
          <UserPlus className="h-4 w-4" /> Create a church account
        </button>
        <button type="button" className="text-sm text-primary-600 hover:underline w-full text-center" disabled={a.busy} onClick={startDemo}>
          Just looking? Try the demo
        </button>
      </Shell>
    );
  }

  if (step.s === 'signinWhere') {
    return (
      <Shell>
        <Title>Where is your church’s data?</Title>
        <p className="text-sm text-gray-500 text-center">Choose where your church account was set up. We’ll find it, then ask for your password.</p>
        <ErrorBox error={a.error} />
        {driveConfigured && <Option icon={<Cloud className="h-5 w-5" />} title="Google Drive" text="Sign in with Google to find it." disabled={a.busy} onClick={openDrive} />}
        {dropboxConfigured && <Option icon={<Cloud className="h-5 w-5" />} title="Dropbox" text="Sign in with Dropbox to find it." disabled={a.busy} onClick={openDropbox} />}
        <Option icon={<HardDrive className="h-5 w-5" />} title="A file on this computer" disabled={a.busy || !fileSupported}
          text={fileSupported ? 'Open your church’s .fidelia file.' : 'Needs Chrome or Edge on a computer.'}
          onClick={() => a.run(async () => go({ s: 'unlock', adapter: await LocalFileAdapter.open() }))} />
        <Back onClick={() => go({ s: 'start' })} />
      </Shell>
    );
  }

  if (step.s === 'drive') {
    return (
      <Shell>
        <Title>Choose your church</Title>
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
          <p className="text-sm text-gray-600">No church account found yet. If someone shared the church file with you, {canPick ? <>choose <b>Find it in Google Drive</b> below.</> : <>open it in Google Drive and choose <b>Open with → Fidelia Ledger</b>.</>} Otherwise, go back and create a church account.</p>
        )}
        {canPick && (
          <button type="button" className="btn-secondary w-full" disabled={a.busy} onClick={() => openDrivePicker('file')}>
            <FolderOpen className="h-4 w-4" /> Find it in Google Drive</button>
        )}
        {canPick && (
          <p className="text-xs text-gray-500">If Google shows an error such as “developer key is invalid” (common in Safari and on iPhone, which block Google’s cookies inside other sites), do this step once on a computer in Chrome. You only need to find the file once: after that it shows up here on every device you sign in to with the same Google account.</p>
        )}
        <Back onClick={() => go({ s: 'start' })} />
      </Shell>
    );
  }

  if (step.s === 'dropbox') {
    return (
      <Shell>
        <Title>Choose your church</Title>
        <ErrorBox error={a.error || step.notice || ''} />
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
        ) : (
          <div className="text-sm text-gray-600 space-y-2">
            <p>No church file found in this Dropbox yet.</p>
            <p>If another treasurer set up the church: ask them to share the church’s folder with you in Dropbox, then open Dropbox’s invitation email and click <b>Join folder</b> (or at dropbox.com, open <b>Shared</b> and click <b>Join</b>). Until you join, the church won’t show up here. It can take a minute.</p>
            <p>Otherwise, go back and create a church account.</p>
          </div>
        )}
        <button type="button" className="btn-secondary w-full" disabled={a.busy}
          onClick={() => a.run(async () => go({ s: 'dropbox', files: await DropboxAdapter.list() }))}>Look again</button>
        {browse === 'signin' ? (
          <DropboxBrowser mode="file" onCancel={() => setBrowse(null)}
            onPick={(path) => { setBrowse(null); go({ s: 'unlock', adapter: new DropboxAdapter(path) }); }} />
        ) : (
          <button type="button" className="btn-secondary w-full" onClick={() => setBrowse('signin')}><FolderOpen className="h-4 w-4" /> Browse my Dropbox</button>
        )}
        <button type="button" className="text-sm text-primary-600 hover:underline w-full text-center" disabled={a.busy}
          onClick={() => a.run(async () => { sessionStorage.setItem(CHOOSE, '1'); sessionStorage.setItem('fidelia.resume', 'dropbox'); await switchDropboxAccount(); })}>
          Use a different Dropbox account
        </button>
        <details className="text-sm">
          <summary className="cursor-pointer text-gray-600">Know where the file is?</summary>
          <form className="mt-2 flex gap-2" onSubmit={(e) => {
            e.preventDefault();
            const raw = dropboxManual.trim();
            if (!raw) return;
            const path = (raw.startsWith('/') ? raw : `/${raw}`).replace(/(\.fidelia)?$/i, '.fidelia');
            a.run(async () => {
              const ad = new DropboxAdapter(path);
              if (!(await ad.exists())) throw new Error(`No church file at ${path} in this Dropbox.`);
              go({ s: 'unlock', adapter: ad });
            });
          }}>
            <input className="input py-1 flex-1 min-w-0" placeholder="/Fidelia/Church.fidelia" value={dropboxManual} onChange={(e) => setDropboxManual(e.target.value)} />
            <button className="btn-secondary" disabled={a.busy}>Open</button>
          </form>
        </details>
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
          <div className="rounded-lg bg-primary-50 p-3 text-sm text-center">
            New here and no password yet?{' '}
            <button type="button" onClick={() => go({ s: 'invite', adapter: step.adapter })} className="font-medium text-primary-700 underline">I have an invite code</button>
          </div>
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

  if (step.s === 'invite') {
    const submit = (e: FormEvent) => { e.preventDefault(); a.run(async () => go({ s: 'join', church: await Church.unlockWithInvite(step.adapter, recoveryKey) })); };
    return (
      <Shell>
        <form onSubmit={submit} className="space-y-5">
          <Title>Join with an invite code</Title>
          <p className="text-sm text-gray-600">An admin of your church gives you this code (Members → Invite someone). You’ll choose your own sign-in name and password next.</p>
          <ErrorBox error={a.error} />
          <Field label="Invite code" value={recoveryKey} onChange={setRecoveryKey} autoComplete="off" autoFocus hint="Looks like ABCD-EFGH-JKLM-NPQR" />
          <Submit busy={a.busy}>Next</Submit>
          <Back onClick={() => go({ s: 'unlock', adapter: step.adapter })} />
        </form>
      </Shell>
    );
  }

  if (step.s === 'join') {
    const role = step.church.inviteRole;
    const submit = (e: FormEvent) => {
      e.preventDefault();
      a.run(async () => { checkNewPassword(); await step.church.acceptInvite(username, displayName, password); setRecoveryKey(''); enterAndRemember(step.church); });
    };
    return (
      <Shell>
        <form onSubmit={submit} className="space-y-5">
          <Title>Welcome!</Title>
          <p className="text-sm text-gray-600 text-center">You’re joining as {role === 'admin' ? 'an' : 'a'} <b>{role}</b>. Choose how you’ll sign in from now on.</p>
          <ErrorBox error={a.error} />
          <Field label="Your full name" value={displayName} onChange={setDisplayName} hint="How others see you, e.g. in the Audit Log. Example: Grace Chen" autoFocus />
          <p className="pt-2 text-sm font-medium text-gray-700 border-t border-gray-100">Your sign-in</p>
          <Field label="Sign-in name" value={username} onChange={setUsername} autoComplete="username" hint="What you type to sign in. Short, no spaces. Example: grace" />
          <Field label="Password (8+ characters)" value={password} onChange={setPassword} type="password" autoComplete="new-password" />
          <Field label="Repeat password" value={password2} onChange={setPassword2} type="password" autoComplete="new-password" />
          <Submit busy={a.busy}>Join</Submit>
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
          <p className="text-sm text-gray-600">Unlocked. Choose your sign-in name and a new password. You will be an admin.</p>
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
      if (/\s/.test(username.trim())) { a.setError('Sign-in name can’t contain spaces'); return; }
      setUsername(username.trim());
      go({ s: 'createWhere' });
    };
    return (
      <Shell>
        <form onSubmit={submit} className="space-y-5">
          <Title>Create a church account</Title>
          <StepLabel n={1} />
          <ErrorBox error={a.error} />
          <Field label="Church name" value={churchName} onChange={setChurchName} autoFocus />
          <Field label="Your full name" value={displayName} onChange={setDisplayName} hint="How others see you, e.g. in the Audit Log. Example: Grace Chen" />
          <Field label="Sign-in name" value={username} onChange={setUsername} autoComplete="username" hint="What you type to sign in. Short, no spaces. Example: grace" />
          <Submit busy={a.busy}>Next</Submit>
          <Back onClick={() => go({ s: 'start' })} />
        </form>
      </Shell>
    );
  }

  if (step.s === 'createWhere') {
    const dropboxFileName = dropboxPath.slice(dropboxPath.lastIndexOf('/') + 1);
    const next = () => a.run(async () => {
      if (!where) throw new Error('Choose where to keep your church’s data');
      const pending: PendingCreate = { churchName, displayName, username, where, driveFolder, driveFileName, dropboxPath, pickedFolder };
      if (where === 'drive') {
        if (!driveFileName.trim()) throw new Error('Enter a file name');
        if (!getGoogleToken()) { sessionStorage.setItem(PENDING_CREATE, JSON.stringify(pending)); startGoogleSignIn('/'); return; }
        go(driveCreateStep(driveFolderChoice({ driveFolder, pickedFolder }), driveFileName));
      } else if (where === 'dropbox') {
        if (!dropboxFileName.trim().replace(/\.fidelia$/i, '')) throw new Error('Enter a file name');
        if (!hasDropboxSession()) {
          sessionStorage.setItem(PENDING_CREATE, JSON.stringify(pending));
          sessionStorage.setItem('fidelia.resume', 'dropbox');
          await startDropboxSignIn(); return;
        }
        go(dropboxCreateStep(dropboxPath));
      } else {
        const ad = await LocalFileAdapter.create();
        go({ s: 'createPassword', label: ad.describe(), getAdapter: async () => ad });
      }
    });
    return (
      <Shell>
        <Title>Where to keep your church’s data</Title>
        <StepLabel n={2} />
        <p className="text-sm text-gray-500 text-center">Your data is stored, encrypted, in your own account. Other treasurers will sign in to the same place.</p>
        <ErrorBox error={a.error} />
        {driveConfigured && (
          <Option icon={<Cloud className="h-5 w-5" />} title="Google Drive" text="Best for a church with one treasurer. Adding others needs Chrome or Edge once." selected={where === 'drive'} onClick={() => setWhere('drive')}>
            {pickedFolder ? (
              <p>Folder: <b>{pickedFolder.name}</b> (chosen in Google Drive) · <button type="button" className="underline text-gray-500" onClick={() => setPickedFolder(null)}>type a folder name instead</button></p>
            ) : (<>
              <label className="flex items-center gap-2">
                <input type="radio" checked={driveFolder !== ''} onChange={() => setDriveFolder('Fidelia')} /> In a folder named
                <input className="input py-1 flex-1 min-w-0" value={driveFolder} disabled={driveFolder === ''} onChange={(e) => setDriveFolder(e.target.value)} />
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={driveFolder === ''} onChange={() => setDriveFolder('')} /> At the top of My Drive
              </label>
            </>)}
            {canPick && (
              <div className="space-y-1">
                <button type="button" className="btn-secondary w-full" disabled={a.busy} onClick={() => {
                  sessionStorage.setItem(PENDING_CREATE, JSON.stringify({ churchName, displayName, username, where: 'drive', driveFolder, driveFileName, dropboxPath, pickedFolder } satisfies PendingCreate));
                  openDrivePicker('folder');
                }}><FolderOpen className="h-4 w-4" /> {pickedFolder ? 'Choose a different folder' : 'Or choose an existing folder in Google Drive'}</button>
                <p className="text-xs text-gray-500">Optional. If Google shows an error there (common in Safari and on iPhone, which block Google’s cookies inside other sites), close it and type a folder name instead.</p>
              </div>
            )}
            <label className="flex items-center gap-2">File name
              <input className="input py-1 flex-1 min-w-0" value={driveFileName} onChange={(e) => setDriveFileName(e.target.value)} />
            </label>
            <p className="text-xs text-gray-500">You can move or rename it in Drive later. Don’t copy or re-upload it.</p>
          </Option>
        )}
        {dropboxConfigured && (
          <Option icon={<Cloud className="h-5 w-5" />} title="Dropbox" text="Recommended. Works in any browser, on any computer and iPhone. A free Dropbox account is enough." selected={where === 'dropbox'} onClick={() => setWhere('dropbox')}>
            {browse === 'create' ? (
              <DropboxBrowser mode="folder" start={parentOf(dropboxPath)} onCancel={() => setBrowse(null)}
                onPick={(folder) => { setDropboxPath(joinPath(folder, dropboxFileName || 'Church.fidelia')); setBrowse(null); }} />
            ) : (
              <div className="space-y-1">
                <p>Folder: <b>{parentOf(dropboxPath) || 'Top of Dropbox'}</b></p>
                <button type="button" className="btn-secondary w-full" disabled={a.busy} onClick={() => {
                  if (hasDropboxSession()) { setBrowse('create'); return; }
                  sessionStorage.setItem(PENDING_CREATE, JSON.stringify({ churchName, displayName, username, where: 'dropbox', driveFolder, driveFileName, dropboxPath, pickedFolder } satisfies PendingCreate));
                  sessionStorage.setItem('fidelia.resume', 'dropbox');
                  sessionStorage.setItem('fidelia.dropboxBrowse', 'create');
                  void a.run(startDropboxSignIn);
                }}><FolderOpen className="h-4 w-4" /> {hasDropboxSession() ? 'Choose or create a folder' : 'Sign in to Dropbox and choose a folder'}</button>
              </div>
            )}
            <label className="flex items-center gap-2">File name
              <input className="input py-1 flex-1 min-w-0" value={dropboxFileName}
                onChange={(e) => setDropboxPath(joinPath(parentOf(dropboxPath), e.target.value.replace(/\//g, '')))} />
            </label>
            <details>
              <summary className="cursor-pointer text-xs text-gray-500">Type the full location instead</summary>
              <input className="input py-1 mt-1" value={dropboxPath} onChange={(e) => setDropboxPath(e.target.value)} />
            </details>
            <p className="text-xs text-gray-500">Keep the church file in its own folder. To add other treasurers later, you share that folder with them in Dropbox. You can move or rename it later; others just choose it again.</p>
          </Option>
        )}
        <Option icon={<HardDrive className="h-5 w-5" />} title="A file on this computer" disabled={!fileSupported} selected={where === 'local'}
          text={fileSupported ? 'Only this computer can open it. You’ll choose where to save it.' : 'Needs Chrome or Edge on a computer.'}
          onClick={() => setWhere('local')} />
        <button type="button" className="btn-primary w-full py-2.5" disabled={a.busy || !where} onClick={next}>
          {a.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : where === 'drive' && !getGoogleToken() ? 'Next: sign in with Google' : where === 'dropbox' && !hasDropboxSession() ? 'Next: sign in with Dropbox' : 'Next'}
        </button>
        <Back onClick={() => go({ s: 'create' })} />
      </Shell>
    );
  }

  if (step.s === 'createPassword') {
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
          <Title>Choose your password</Title>
          <StepLabel n={3} />
          <p className="text-sm text-gray-500 text-center">{churchName} · signing in as <b>{username}</b><br />Saving to {step.label}</p>
          <ErrorBox error={a.error} />
          <input type="text" autoComplete="username" value={username} readOnly hidden />
          <Field label="Password (8+ characters)" value={password} onChange={setPassword} type="password" autoComplete="new-password" autoFocus />
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
          <p className="text-xs text-gray-500">There is no “forgot password” email. Next you’ll get a recovery key to print, and you should add a second admin soon.</p>
          <Submit busy={a.busy}>Create church account</Submit>
          <Back onClick={() => go({ s: 'createWhere' })} />
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
