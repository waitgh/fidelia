import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { api } from './api.js';

export interface AuthUser {
  id: number;
  username: string;
  displayName: string;
  role: 'admin' | 'bookkeeper' | 'viewer';
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  loggingOut: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

/* ── Sync Toast (non-blocking pull indicator after login) ─────────── */

type ToastState =
  | null
  | { step: 'syncing' }
  | { step: 'done'; ok: boolean; message: string; canForcePull?: boolean };

const TOAST_LINGER_MS = 3000;

function SyncToast({ state, onDismiss, onForcePull }: { state: NonNullable<ToastState>; onDismiss: () => void; onForcePull?: () => void }) {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  useEffect(() => {
    if (state.step !== 'done') return;
    if (!state.ok) return; // errors require manual dismissal
    const id = setTimeout(() => {
      setExiting(true);
      setTimeout(onDismiss, 300);
    }, TOAST_LINGER_MS);
    return () => clearTimeout(id);
  }, [state, onDismiss]);

  const handleDismiss = () => {
    setExiting(true);
    setTimeout(onDismiss, 300);
  };

  const isDoneError = state.step === 'done' && !state.ok;
  const base = `fixed top-4 right-4 z-50 flex items-center gap-3 rounded-lg px-4 py-3 shadow-lg border backdrop-blur-sm transition-all duration-300 ${isDoneError ? 'max-w-md' : 'max-w-sm'}`;
  const slideClass = visible && !exiting ? 'translate-x-0 opacity-100' : 'translate-x-8 opacity-0';

  if (state.step === 'syncing') {
    return (
      <div className={`${base} ${slideClass} bg-primary-900/90 border-primary-700 text-white`}>
        <div className="h-4 w-4 rounded-full border-2 border-primary-600 border-t-primary-300 animate-spin shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium">Syncing from cloud…</p>
          <p className="text-xs text-primary-400 truncate">Downloading latest data</p>
        </div>
      </div>
    );
  }

  const ok = state.ok;
  return (
    <div
      className={`${base} ${slideClass} ${
        ok ? 'bg-green-950/90 border-green-800 text-green-200' : 'bg-red-950/95 border-red-600 text-red-100 shadow-red-900/50'
      }`}
    >
      {ok ? (
        <svg className="h-5 w-5 text-green-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ) : (
        <svg className="h-6 w-6 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
      )}
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-bold ${ok ? '' : 'text-red-200'}`}>{ok ? 'Sync complete' : (state.step === 'done' && state.canForcePull ? 'Local changes not pushed' : 'Download failed')}</p>
        <p className={`text-xs ${ok ? 'text-green-400 truncate' : 'text-red-300'}`}>{state.message}</p>
        {!ok && !state.canForcePull && <p className="text-xs text-red-400 mt-0.5">Check Backup &amp; Sync to retry.</p>}
        {!ok && state.canForcePull && onForcePull && (
          <button
            onClick={onForcePull}
            className="mt-1.5 text-xs font-semibold bg-red-700/60 hover:bg-red-700 text-red-100 px-2 py-0.5 rounded transition-colors"
          >
            Force pull (overwrite local)
          </button>
        )}
      </div>
      <button onClick={handleDismiss} className="shrink-0 p-0.5 rounded hover:bg-white/10 transition-colors">
        <svg className="h-3.5 w-3.5 opacity-60" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

/* ── Logout Overlay (blocking push indicator) ─────────────────────── */

type LogoutPhase =
  | null
  | { step: 'syncing' }
  | { step: 'result'; ok: boolean; message: string };

const RESULT_DISPLAY_MS = 8000;
const RESULT_ERROR_DISPLAY_MS = 12000;

function LogoutOverlay({ phase }: { phase: NonNullable<LogoutPhase> }) {
  const isSyncing = phase.step === 'syncing';
  const isOk = phase.step === 'result' && phase.ok;
  const isError = phase.step === 'result' && !phase.ok;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-primary-950/95 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4 transition-all duration-300">
        {isSyncing && (
          <>
            <div className="h-10 w-10 rounded-full border-3 border-primary-700 border-t-primary-300 animate-spin" />
            <p className="text-lg font-medium text-white">Saving data to cloud…</p>
            <p className="text-sm text-primary-400">Please wait while your changes are synced</p>
          </>
        )}

        {isOk && (
          <>
            <div className="h-12 w-12 rounded-full bg-green-600/20 flex items-center justify-center animate-[fadeScaleIn_0.3s_ease-out]">
              <svg className="h-7 w-7 text-green-400" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <p className="text-lg font-medium text-green-300">Data saved successfully</p>
            <p className="text-sm text-primary-400">{phase.message}</p>
          </>
        )}

        {isError && (
          <>
            <div className="h-12 w-12 rounded-full bg-red-600/30 flex items-center justify-center animate-[fadeScaleIn_0.3s_ease-out]">
              <svg className="h-7 w-7 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            </div>
            <p className="text-lg font-bold text-red-400">Sync failed — data not saved to cloud</p>
            <p className="text-sm text-red-300 max-w-xs text-center">{phase.message}</p>
            <p className="text-xs text-primary-400 max-w-xs text-center">Go to Backup &amp; Sync after logging back in to push your changes.</p>
          </>
        )}
      </div>

      {isSyncing && (
        <div className="mt-8 w-64 h-1 bg-primary-800 rounded-full overflow-hidden">
          <div className="h-full bg-primary-400 rounded-full animate-[indeterminate_1.5s_ease-in-out_infinite]" />
        </div>
      )}

      {!isSyncing && (
        <div className="mt-8 w-64 h-1 bg-primary-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${isOk ? 'bg-green-500' : 'bg-red-500'}`}
            style={{ width: '100%' }}
          />
        </div>
      )}
    </div>
  );
}

/* ── Idle Logout ──────────────────────────────────────────────────── */

const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const IDLE_WARNING_MS = 60 * 1000;       // warn 60 s before logout
const IDLE_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'] as const;

/* ── Auth Provider ────────────────────────────────────────────────── */

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [logoutPhase, setLogoutPhase] = useState<LogoutPhase>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [idleWarning, setIdleWarning] = useState(false);
  const pullAbort = useRef<AbortController | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchMe = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        setUser(await res.json());
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  useEffect(() => {
    const handler = () => {
      setUser(null);
      setLoading(false);
    };
    window.addEventListener('auth:expired', handler);
    return () => window.removeEventListener('auth:expired', handler);
  }, []);

  // Idle logout — cleared/restarted on any user activity, only active when logged in
  const logoutRef = useRef<(() => Promise<void>) | null>(null);

  const clearIdleTimers = useCallback(() => {
    if (idleTimer.current) { clearTimeout(idleTimer.current); idleTimer.current = null; }
    if (warningTimer.current) { clearTimeout(warningTimer.current); warningTimer.current = null; }
    setIdleWarning(false);
  }, []);

  const resetIdleTimer = useCallback(() => {
    clearIdleTimers();
    warningTimer.current = setTimeout(() => setIdleWarning(true), IDLE_TIMEOUT_MS - IDLE_WARNING_MS);
    idleTimer.current = setTimeout(() => {
      logoutRef.current?.();
    }, IDLE_TIMEOUT_MS);
  }, [clearIdleTimers]);

  useEffect(() => {
    if (!user) { clearIdleTimers(); return; }

    resetIdleTimer();
    IDLE_EVENTS.forEach((e) => window.addEventListener(e, resetIdleTimer, { passive: true }));
    return () => {
      clearIdleTimers();
      IDLE_EVENTS.forEach((e) => window.removeEventListener(e, resetIdleTimer));
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const backgroundPull = useCallback(async () => {
    try {
      const { configured } = await api.sync.status();
      if (!configured) return;
    } catch {
      return;
    }

    pullAbort.current?.abort();
    const ctrl = new AbortController();
    pullAbort.current = ctrl;

    setToast({ step: 'syncing' });
    try {
      const result = await api.sync.pull();
      if (ctrl.signal.aborted) return;
      const ok = result.status === 'updated' || result.status === 'up-to-date' || result.status === 'no-remote';
      const canForcePull = result.status === 'local-ahead';
      setToast({ step: 'done', ok, message: result.message, canForcePull });
      if (result.status === 'updated') {
        window.location.reload();
      }
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setToast({ step: 'done', ok: false, message: (err as Error).message });
    }
  }, []);

  const handleForcePull = useCallback(async () => {
    setToast({ step: 'syncing' });
    try {
      const result = await api.sync.pull(true);
      const ok = result.status === 'updated' || result.status === 'up-to-date' || result.status === 'no-remote';
      setToast({ step: 'done', ok, message: result.message });
      if (result.status === 'updated') window.location.reload();
    } catch (err) {
      setToast({ step: 'done', ok: false, message: (err as Error).message });
    }
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'Login failed' }));
      throw new Error(body.error || 'Login failed');
    }

    const data = await res.json();
    const loggedInUser: AuthUser = { id: data.id, username: data.username, displayName: data.displayName, role: data.role };
    setUser(loggedInUser);

    backgroundPull();
  }, [backgroundPull]);

  const logout = useCallback(async () => {
    clearIdleTimers();
    pullAbort.current?.abort();
    setToast(null);

    const willSync = user?.role !== 'viewer';

    if (willSync) {
      setLogoutPhase({ step: 'syncing' });
    }

    let ok = true;
    let message = 'Signed out';

    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.sync) {
          ok = data.sync.status === 'updated' || data.sync.status === 'up-to-date' || data.sync.status === 'no-remote';
          message = data.sync.message;
          console.log(`[sync:push] ${data.sync.status}: ${data.sync.message}`);
        }
      }
    } catch (err) {
      ok = false;
      message = (err as Error).message;
    }

    if (willSync) {
      setLogoutPhase({ step: 'result', ok, message });
      await new Promise((r) => setTimeout(r, ok ? RESULT_DISPLAY_MS : RESULT_ERROR_DISPLAY_MS));
      setLogoutPhase(null);
    }

    setUser(null);
  }, [user?.role]);

  // Keep ref in sync so the idle timer can call the latest logout closure
  useEffect(() => { logoutRef.current = logout; }, [logout]);

  const loggingOut = logoutPhase !== null;

  return (
    <AuthContext.Provider value={{ user, loading, loggingOut, login, logout }}>
      {children}
      {idleWarning && !logoutPhase && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-lg px-4 py-3 shadow-lg border bg-amber-950/95 border-amber-700 text-amber-200 backdrop-blur-sm animate-[fadeScaleIn_0.3s_ease-out]">
          <svg className="h-5 w-5 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <p className="text-sm font-medium">You'll be signed out in 1 minute due to inactivity.</p>
          <button
            onClick={resetIdleTimer}
            className="ml-1 shrink-0 rounded px-2 py-0.5 text-xs font-semibold bg-amber-700/50 hover:bg-amber-700 transition-colors"
          >
            Stay signed in
          </button>
        </div>
      )}
      {logoutPhase && <LogoutOverlay phase={logoutPhase} />}
      {toast && !logoutPhase && <SyncToast state={toast} onDismiss={() => setToast(null)} onForcePull={handleForcePull} />}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
