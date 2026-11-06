// Welcome / unlock screen: open a church file, create a new church, or try the demo.
// Everything happens in this browser; nothing is sent to a server.
import { useState, type FormEvent, type ReactNode } from 'react';
import { Loader2, AlertCircle, FolderOpen, PlusCircle, PlayCircle, KeyRound, Printer } from 'lucide-react';
import { useAuth } from '../lib/auth.js';
import { LogoMark } from '../components/Logo.js';
import { Church } from '../church/church';
import { MemoryAdapter } from '../storage/memory';
import { LocalFileAdapter } from '../storage/localFile';
import type { StorageAdapter } from '../storage/types';
import { seedDemo } from '../data/seed';

type Step =
  | { s: 'start' }
  | { s: 'unlock'; adapter: StorageAdapter }
  | { s: 'recover'; adapter: StorageAdapter }
  | { s: 'claim'; church: Church }
  | { s: 'create'; adapter: StorageAdapter }
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

function Field(p: { label: string; value: string; onChange: (v: string) => void; type?: string; autoComplete?: string; autoFocus?: boolean }) {
  return (
    <label className="block">
      <span className="label">{p.label}</span>
      <input className="input" type={p.type ?? 'text'} value={p.value} onChange={(e) => p.onChange(e.target.value)}
        autoComplete={p.autoComplete} autoFocus={p.autoFocus} required />
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
  const fileSupported = LocalFileAdapter.supported();

  const go = (s: Step) => { a.setError(''); setPassword(''); setPassword2(''); setStep(s); };

  const checkNewPassword = () => {
    if (password.length < 8) throw new Error('Password must be at least 8 characters');
    if (password !== password2) throw new Error('Passwords do not match');
  };

  if (step.s === 'start') {
    const Choice = (p: { icon: ReactNode; title: string; text: string; onClick: () => void; disabled?: boolean }) => (
      <button type="button" disabled={p.disabled || a.busy} onClick={p.onClick}
        className="w-full flex items-start gap-3 text-left rounded-xl border border-gray-200 p-4 hover:border-primary-400 hover:bg-primary-50 disabled:opacity-50">
        <span className="text-primary-600 mt-0.5">{p.icon}</span>
        <span><span className="block font-medium text-gray-900">{p.title}</span><span className="block text-sm text-gray-500">{p.text}</span></span>
      </button>
    );
    return (
      <Shell>
        <Title>Welcome</Title>
        <ErrorBox error={a.error} />
        <Choice icon={<FolderOpen className="h-5 w-5" />} title="Open church file" disabled={!fileSupported}
          text={fileSupported ? 'Open your church’s .fidelia file on this computer.' : 'Opening local files needs Chrome or Edge on a computer.'}
          onClick={() => a.run(async () => go({ s: 'unlock', adapter: await LocalFileAdapter.open() }))} />
        <Choice icon={<PlusCircle className="h-5 w-5" />} title="Set up a new church" disabled={!fileSupported}
          text="Create a new encrypted church file."
          onClick={() => a.run(async () => go({ s: 'create', adapter: await LocalFileAdapter.create() }))} />
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

  if (step.s === 'unlock') {
    const submit = (e: FormEvent) => { e.preventDefault(); a.run(async () => enter(await Church.unlock(step.adapter, username, password))); };
    return (
      <Shell>
        <form onSubmit={submit} className="space-y-5">
          <Title>Sign in</Title>
          <p className="text-sm text-gray-500 text-center">{step.adapter.describe()}</p>
          <ErrorBox error={a.error} />
          <Field label="Username" value={username} onChange={setUsername} autoComplete="username" autoFocus />
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
      a.run(async () => { checkNewPassword(); await step.church.claimAsAdmin(username, displayName, password); enter(step.church); });
    };
    return (
      <Shell>
        <form onSubmit={submit} className="space-y-5">
          <Title>Set a new password</Title>
          <p className="text-sm text-gray-600">Unlocked. Choose your username and a new password. You will be an admin.</p>
          <ErrorBox error={a.error} />
          <Field label="Username" value={username} onChange={setUsername} autoComplete="username" autoFocus />
          <Field label="Your name" value={displayName} onChange={setDisplayName} />
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
        const { church, recoveryKey: key } = await Church.create(step.adapter, { churchName, username, displayName, password });
        go({ s: 'recoveryKey', church, key });
      });
    };
    return (
      <Shell>
        <form onSubmit={submit} className="space-y-5">
          <Title>Set up your church</Title>
          <p className="text-sm text-gray-500 text-center">Saving to {step.adapter.describe()}</p>
          <ErrorBox error={a.error} />
          <Field label="Church name" value={churchName} onChange={setChurchName} autoFocus />
          <Field label="Your name" value={displayName} onChange={setDisplayName} />
          <Field label="Username" value={username} onChange={setUsername} autoComplete="username" />
          <Field label="Password (8+ characters)" value={password} onChange={setPassword} type="password" autoComplete="new-password" />
          <Field label="Repeat password" value={password2} onChange={setPassword2} type="password" autoComplete="new-password" />
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
      <button type="button" disabled={!saved} onClick={() => enter(step.church)} className="btn-primary w-full py-2.5 print:hidden">Continue</button>
    </Shell>
  );
}
