// Church session provider. Keeps the old `useAuth()` shape so pages need few changes,
// but "logging in" now means unlocking an encrypted church file in this browser.
import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { Church, type SaveState } from '../church/church';
import { onDirty, setReadOnlyCheck, setSession, setUserName } from '../data/session';
import { AuthExpiredError, GoogleDriveAdapter } from '../storage/googleDrive';
import { startGoogleSignIn } from '../storage/googleAuth';
import { setMailer } from '../mail/types';
import { DropboxAdapter, startDropboxSignIn } from '../storage/dropbox';

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [church, setChurch] = useState<Church | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [loggingOut, setLoggingOut] = useState(false);
  const [, setTick] = useState(0);
  const [idleWarning, setIdleWarning] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoutRef = useRef<() => Promise<void>>(async () => {});

  const enter = useCallback((c: Church) => {
    setSession(c.opened);
    setReadOnlyCheck(() => c.readOnly);
    setUserName(c.user?.displayName ?? '');
    setChurch(c);
  }, []);

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
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      offDirty(); offState();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [church]);

  const logout = useCallback(async () => {
    if (!church) return;
    setLoggingOut(true);
    try {
      if (church.hasUnsavedChanges && !church.readOnly) await church.saveNow();
    } catch (e) {
      setLoggingOut(false);
      if (!window.confirm(`Your latest changes could not be saved: ${(e as Error).message}\n\nSign out anyway and lose them?`)) return;
    }
    church.close();
    setMailer(null);
    setSession(null);
    setChurch(null);
    setLoggingOut(false);
  }, [church]);
  useEffect(() => { logoutRef.current = logout; }, [logout]);

  // Idle sign-out: decrypted data should not sit open on an unattended screen.
  const clearIdle = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (warningTimer.current) clearTimeout(warningTimer.current);
    setIdleWarning(false);
  }, []);
  const resetIdle = useCallback(() => {
    clearIdle();
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
    <AuthContext.Provider value={{ user, church, saveState, loading: false, loggingOut, enter, logout }}>
      {children}
      {idleWarning && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-lg px-4 py-3 shadow-lg border bg-amber-950/95 border-amber-700 text-amber-200">
          <p className="text-sm font-medium">You'll be signed out in 1 minute due to inactivity.</p>
          <button onClick={resetIdle} className="ml-1 shrink-0 rounded px-2 py-0.5 text-xs font-semibold bg-amber-700/50 hover:bg-amber-700">
            Stay signed in
          </button>
        </div>
      )}
      {church?.lockedBy && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-lg px-4 py-3 shadow-lg border bg-blue-50 border-blue-300 text-blue-900">
          <p className="text-sm"><b>{church.lockedBy.owner}</b> is editing right now, so you can only view. Reopen later to see their changes.</p>
          <button className="btn-secondary btn-sm" onClick={() => void church.takeLock().then(() => { setSession(church.opened); setTick((n) => n + 1); })}>Try again</button>
        </div>
      )}
      {church && saveState === 'error' && church.lastError instanceof AuthExpiredError && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-lg px-4 py-3 shadow-lg border bg-amber-50 border-amber-300 text-amber-900">
          <p className="text-sm">Your cloud sign-in expired. Your changes are kept safely in this browser.</p>
          <button className="btn-primary btn-sm" onClick={() => {
            if (church.adapter instanceof GoogleDriveAdapter) {
              sessionStorage.setItem('fidelia.driveOpen', JSON.stringify({ id: church.adapter.fileId, name: church.adapter.describe() }));
            }
            const adapter = church.adapter;
            church.close(); setSession(null);
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
