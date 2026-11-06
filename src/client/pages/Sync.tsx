import { useState, useCallback } from 'react';
import {
  CloudDownload, CloudUpload, Loader2, Check, AlertCircle,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { SyncSetup } from '../components/SyncSetup.js';

type SyncState = 'idle' | 'loading' | 'success' | 'error' | 'warn';
type ForceTarget = 'pull' | 'push' | null;

export function Sync() {
  const [connected, setConnected] = useState(false);
  const [pullState, setPullState] = useState<SyncState>('idle');
  const [pushState, setPushState] = useState<SyncState>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [forceTarget, setForceTarget] = useState<ForceTarget>(null);

  const resetAfterDelay = useCallback((setter: (s: SyncState) => void) => {
    setTimeout(() => {
      setter('idle');
      setMessage(null);
      setForceTarget(null);
    }, 5000);
  }, []);

  const dismiss = () => {
    setPullState('idle');
    setPushState('idle');
    setMessage(null);
    setForceTarget(null);
  };

  const doPull = async (force: boolean) => {
    if (pullState === 'loading' || pushState === 'loading') return;
    setPullState('loading');
    setMessage(null);
    setForceTarget(null);
    try {
      const result = await api.sync.pull(force);
      if (result.status === 'local-ahead') {
        setPullState('warn');
        setMessage(result.message);
        setForceTarget('pull');
        return;
      }
      setPullState('success');
      setMessage(result.message);
      if (result.status === 'updated') window.location.reload();
      resetAfterDelay(setPullState);
    } catch (err) {
      setPullState('error');
      setMessage((err as Error).message);
      resetAfterDelay(setPullState);
    }
  };

  const doPush = async (force: boolean) => {
    if (pullState === 'loading' || pushState === 'loading') return;
    setPushState('loading');
    setMessage(null);
    setForceTarget(null);
    try {
      const result = await api.sync.push(force);
      if (result.status === 'remote-ahead') {
        setPushState('warn');
        setMessage(result.message);
        setForceTarget('push');
        return;
      }
      setPushState('success');
      setMessage(result.message);
      resetAfterDelay(setPushState);
    } catch (err) {
      setPushState('error');
      setMessage((err as Error).message);
      resetAfterDelay(setPushState);
    }
  };

  const busy = pullState === 'loading' || pushState === 'loading';
  const confirming = forceTarget !== null;
  const disabled = !connected || busy || confirming;

  const stateStyles = (state: SyncState) => {
    if (!connected) return 'bg-gray-50 border-gray-200 text-gray-300 cursor-not-allowed';
    switch (state) {
      case 'loading': return 'bg-gray-100 text-gray-500 cursor-wait';
      case 'success': return 'bg-green-50 border-green-200 text-green-700';
      case 'error': return 'bg-red-50 border-red-200 text-red-700';
      case 'warn': return 'bg-amber-50 border-amber-200 text-amber-700';
      default: return 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50';
    }
  };

  const icon = (state: SyncState, IdleIcon: typeof CloudDownload) => {
    if (state === 'loading') return <Loader2 className="h-5 w-5 animate-spin" />;
    if (state === 'success') return <Check className="h-5 w-5" />;
    if (state === 'error' || state === 'warn') return <AlertCircle className="h-5 w-5" />;
    return <IdleIcon className="h-5 w-5" />;
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Backup & Sync</h1>
      </div>

      {/* Cloud storage setup */}
      <SyncSetup onConnectionChange={setConnected} />

      {/* Pull / Push */}
      <div className={`card p-6 mt-6 ${!connected ? 'opacity-60' : ''}`}>
        <h2 className="text-lg font-semibold mb-1">Manual Sync</h2>
        <p className="text-sm text-gray-500 mb-4">
          {connected
            ? 'Pull the latest database from cloud storage, or push your local changes.'
            : 'Connect to a cloud storage provider above to enable sync.'}
        </p>

        <div className="flex gap-3 flex-wrap">
          <button
            onClick={() => doPull(false)}
            disabled={disabled}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${stateStyles(pullState)}`}
          >
            {icon(pullState, CloudDownload)}
            Pull from Remote
          </button>
          <button
            onClick={() => doPush(false)}
            disabled={disabled}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${stateStyles(pushState)}`}
          >
            {icon(pushState, CloudUpload)}
            Push to Remote
          </button>
        </div>

        {message && (
          <p className={`mt-3 text-sm ${confirming ? 'text-amber-600' : 'text-gray-600'}`}>
            {message}
          </p>
        )}
        {confirming && (
          <div className="mt-3 flex gap-3">
            <button
              onClick={() => forceTarget === 'pull' ? doPull(true) : doPush(true)}
              className="btn-sm px-4 py-2 rounded-lg bg-amber-100 text-amber-800 font-medium hover:bg-amber-200 transition-colors"
            >
              {forceTarget === 'pull' ? 'Overwrite local' : 'Overwrite remote'}
            </button>
            <button onClick={dismiss} className="btn-secondary btn-sm">
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
