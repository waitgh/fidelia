// Church session provider. Keeps the old `useAuth()` shape so pages need few changes,
// but "logging in" now means unlocking an encrypted church file in this browser.
import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Church, type SaveState } from '../church/church';
import { onDirty, setReadOnlyCheck, setSession, setUserName } from '../data/session';
import { AuthExpiredError, GoogleDriveAdapter } from '../storage/googleDrive';
import { startGoogleSignIn } from '../storage/googleAuth';
import { setMailer } from '../mail/types';
import { DropboxAdapter, hasDropboxSession, startDropboxSignIn } from '../storage/dropbox';
import { getGoogleToken } from '../storage/googleAuth';
import { LocalFileAdapter } from '../storage/localFile';
import { forgetSession, hasResumableSession, rememberSession, resumeSession, touchSession, type AdapterFor } from '../church/resume';

export interface AuthUser {
  id: number;
  username: string;
  displayName: string;
  role: 'admin' | 'bookkeeper' | 'viewer';
}

interface AuthContextType {
  user: AuthUser | null;
  church: Church | null;
  saveState: SaveState;
  loading: boolean;
  loggingOut: boolean;
  /** Installs an unlocked church as the active session. */
  enter: (church: Church) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const IDLE_WARNING_MS = 60 * 1000;
const IDLE_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'] as const;

/** Rebuilds the storage adapter for a refreshed tab, if it can be reached without a prompt or redirect. */
const adapterFor: AdapterFor = async ({ kind, ref, name, handle }) => {
  if (kind === 'dropbox') return ref && hasDropboxSession() ? new DropboxAdapter(ref) : null;
  if (kind === 'google-drive') return ref && getGoogleToken() ? new GoogleDriveAdapter(ref, name ?? '', getGoogleToken) : null;
  const h = handle as { queryPermission?: (o: { mode: string }) => Promise<string> } | undefined;
  if (!h?.queryPermission || (await h.queryPermission({ mode: 'readwrite' })) !== 'granted') return null;
  return new LocalFileAdapter(h as ConstructorParameters<typeof LocalFileAdapter>[0]);
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [church, setChurch] = useState<Church | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [loggingOut, setLoggingOut] = useState(false);
  const [, setTick] = useState(0);
  const [idleWarning, setIdleWarning] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoutRef = useRef<() => Promise<void>>(async () => {});
  // After a refresh, reopen the church this tab had open (see church/resume.ts) instead of asking for the password.
  const [resuming, setResuming] = useState(() => hasResumableSession());
  const resumeStarted = useRef(false);

  const enter = useCallback((c: Church) => {
    setSession(c.opened);
    setReadOnlyCheck(() => c.readOnly);
    setUserName(c.user?.displayName ?? '');
    setChurch(c);
    void rememberSession(c, IDLE_TIMEOUT_MS).catch(() => {});
  }, []);

  useEffect(() => {
    if (!resuming || resumeStarted.current) return;
    resumeStarted.current = true;
    void resumeSession(adapterFor, Church.resume)
      .then((c) => { if (c) enter(c); })
      .catch(() => {})
      .finally(() => setResuming(false));
  }, [resuming, enter]);

  // Autosave wiring: data writes → church.markDirty; save on hide; warn on unload.
  useEffect(() => {
    if (!church) return;
    const offDirty = onDirty(() => church.markDirty());
    const offState = church.onState((s) => { setSession(church.opened); setSaveState(s); setTick((n) => n + 1); });
    const flush = () => {
      if (church.hasUnsavedChanges && !church.readOnly) void church.saveNow().catch(() => {});
    };
    const onVis = () => { if (document.visibilityState === 'hidden') flush(); };
    const onUnload = (e: BeforeUnloadEvent) => {
      if (church.hasUnsavedChanges) { flush(); e.preventDefault(); e.returnValue = ''; }
    };
    const onPageHide = () => { church.releaseLockOnExit(); flush(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      offDirty(); offState();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [church]);

  // Someone else is editing: check every 30 s and take over as soon as they leave or their lock expires.
  const lockedOut = !!church?.lockedBy;
  useEffect(() => {
    if (!church || !lockedOut) return;
    const t = setInterval(() => {
      void church.takeLock().then((ok) => { if (ok) { setSession(church.opened); setTick((n) => n + 1); } }).catch(() => {});
    }, 30_000);
    return () => clearInterval(t);
  }, [church, lockedOut]);

  const logout = useCallback(async () => {
    if (!church) return;
    setLoggingOut(true);
    try {
      // Never let a stuck upload trap someone in: give up waiting after 20 s and ask.
      if (church.hasUnsavedChanges && !church.readOnly) {
        await Promise.race([
          church.saveNow(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('saving is taking too long (check your internet connection)')), 20_000)),
        ]);
      }
    } catch (e) {
      setLoggingOut(false);
      if (!window.confirm(`Your latest changes could not be saved: ${(e as Error).message}\n\nSign out anyway and lose them?`)) return;
    }
    church.close();
    await forgetSession();
    setMailer(null);
    setSession(null);
    setChurch(null);
    setLoggingOut(false);
    // Signed out on /audit etc.: start again from the front page, not the old address.
    navigate('/', { replace: true });
  }, [church, navigate]);
  useEffect(() => { logoutRef.current = logout; }, [logout]);

  // Idle sign-out: decrypted data should not sit open on an unattended screen.
  const clearIdle = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (warningTimer.current) clearTimeout(warningTimer.current);
    setIdleWarning(false);
  }, []);
  const resetIdle = useCallback(() => {
    clearIdle();
    touchSession(IDLE_TIMEOUT_MS);
    warningTimer.current = setTimeout(() => setIdleWarning(true), IDLE_TIMEOUT_MS - IDLE_WARNING_MS);
    idleTimer.current = setTimeout(() => void logoutRef.current(), IDLE_TIMEOUT_MS);
  }, [clearIdle]);
  useEffect(() => {
    if (!church) { clearIdle(); return; }
    resetIdle();
    IDLE_EVENTS.forEach((e) => window.addEventListener(e, resetIdle, { passive: true }));
    return () => { clearIdle(); IDLE_EVENTS.forEach((e) => window.removeEventListener(e, resetIdle)); };
  }, [church, resetIdle, clearIdle]);

  const user: AuthUser | null = church?.user
    ? { id: 0, username: church.user.username, displayName: church.user.displayName, role: church.readOnly ? 'viewer' : church.user.role }
    : null;

  return (
    <AuthContext.Provider value={{ user, church, saveState, loading: resuming, loggingOut, enter, logout }}>
      {children}
      {idleWarning && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-lg px-4 py-3 shadow-lg border bg-amber-950/95 border-amber-700 text-amber-200">
          <p className="text-sm font-medium">You'll be signed out in 1 minute due to inactivity.</p>
          <button onClick={resetIdle} className="ml-1 shrink-0 rounded px-2 py-0.5 text-xs font-semibold bg-amber-700/50 hover:bg-amber-700">
            Stay signed in
          </button>
        </div>
      )}
      {church?.lockedBy && (church.lockedByMe ? (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-lg px-4 py-3 shadow-lg border bg-blue-50 border-blue-300 text-blue-900 max-w-[calc(100vw-2rem)]">
          <p className="text-sm">You have this church open for editing in <b>another window, tab or device</b>, so this one is view-only. Switch editing here? The other one becomes view-only within a minute; anything it hasn’t saved yet won’t be saved.</p>
          <button className="btn-primary btn-sm shrink-0" onClick={() => void church.takeOverFromMyOtherWindow().then(() => { setSession(church.opened); setTick((n) => n + 1); })}>Edit here instead</button>
        </div>
      ) : (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-lg px-4 py-3 shadow-lg border bg-blue-50 border-blue-300 text-blue-900 max-w-[calc(100vw-2rem)]">
          <p className="text-sm"><b>{church.lockedBy.owner}</b> is editing right now, so you can only view. You’ll be switched to editing automatically when they sign out or close Fidelia.</p>
          <button className="btn-secondary btn-sm shrink-0" onClick={() => void church.takeLock().then(() => { setSession(church.opened); setTick((n) => n + 1); })}>Try again</button>
        </div>
      ))}
      {church && saveState === 'error' && church.lastError instanceof AuthExpiredError && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-lg px-4 py-3 shadow-lg border bg-amber-50 border-amber-300 text-amber-900">
          <p className="text-sm">Your cloud sign-in expired. Your changes are kept safely in this browser.</p>
          <button className="btn-primary btn-sm" onClick={() => {
            if (church.adapter instanceof GoogleDriveAdapter) {
              sessionStorage.setItem('fidelia.driveOpen', JSON.stringify({ id: church.adapter.fileId, name: church.adapter.describe() }));
            }
            const adapter = church.adapter;
            church.close(); setSession(null); void forgetSession();
            if (adapter instanceof DropboxAdapter) {
              sessionStorage.setItem('fidelia.dropboxOpen', adapter.path);
              sessionStorage.setItem('fidelia.resume', 'dropbox');
              void startDropboxSignIn();
            } else startGoogleSignIn('/');
          }}>
            Sign in again
          </button>
        </div>
      )}
      {loggingOut && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary-950/95">
          <p className="text-lg font-medium text-white">Saving your changes…</p>
        </div>
      )}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
