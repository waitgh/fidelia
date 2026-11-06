import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api.js';
import {
  Save, CheckCircle2, XCircle, Loader2,
  RefreshCw, CloudOff, Plug, ExternalLink, Unplug, Folder, ChevronRight, Shield, Lock, Unlock,
} from 'lucide-react';

interface RcloneRemote {
  name: string;
  type: string;
}

interface RcloneInfo {
  installed: boolean;
  version: string;
  remotes: RcloneRemote[];
  currentRemote: string | null;
}

interface EncryptionStatus {
  enabled: boolean;
  unlocked: boolean;
  hasLocalPassphrase: boolean;
  usingEnvPassphrase: boolean;
}

const PROVIDERS = [
  {
    id: 'dropbox',
    label: 'Dropbox',
    description: 'Simple and reliable. Free tier: 2 GB.',
    remoteName: 'dropbox',
  },
  {
    id: 'drive',
    label: 'Google Drive',
    description: 'Generous storage. Free tier: 15 GB.',
    remoteName: 'gdrive',
  },
  {
    id: 'onedrive',
    label: 'Microsoft OneDrive',
    description: 'Great if your church uses Microsoft 365. Free tier: 5 GB.',
    remoteName: 'onedrive',
  },
  {
    id: 'box',
    label: 'Box',
    description: 'Business-focused cloud storage. Free tier: 10 GB.',
    remoteName: 'box',
  },
] as const;

function providerLabel(type: string): string {
  return PROVIDERS.find((p) => p.id === type)?.label ?? type;
}

function normalizePath(path: string): string {
  return path.replace(/^\/+|\/+$/g, '');
}

function joinPath(base: string, name: string): string {
  const left = normalizePath(base);
  const right = normalizePath(name);
  return left ? `${left}/${right}` : right;
}

function parentPath(path: string): string {
  const parts = normalizePath(path).split('/').filter(Boolean);
  parts.pop();
  return parts.join('/');
}

interface SyncSetupProps {
  onConnectionChange?: (connected: boolean) => void;
}

export function SyncSetup({ onConnectionChange }: SyncSetupProps = {}) {
  const [info, setInfo] = useState<RcloneInfo | null>(null);
  const [encryptionStatus, setEncryptionStatus] = useState<EncryptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingEncryption, setLoadingEncryption] = useState(true);
  const [remotePath, setRemotePath] = useState('');
  const [folderPath, setFolderPath] = useState('');
  const [showFolderBrowser, setShowFolderBrowser] = useState(true);
  const [browserPath, setBrowserPath] = useState('');
  const [browserFolders, setBrowserFolders] = useState<string[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [folderBrowserError, setFolderBrowserError] = useState('');
  const [selectedRemote, setSelectedRemote] = useState('');
  const [showProviderPicker, setShowProviderPicker] = useState(false);
  const [securityMode, setSecurityMode] = useState<null | 'enable' | 'unlock'>(null);
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingEncryption, setSavingEncryption] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [securityPassphrase, setSecurityPassphrase] = useState('');
  const [securityConfirmPassphrase, setSecurityConfirmPassphrase] = useState('');
  const [securityAcknowledged, setSecurityAcknowledged] = useState(false);

  const showSuccess = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(''), 4000);
  };

  const loadInfo = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.sync.rcloneInfo();
      setInfo(data);

      if (data.currentRemote) {
        setRemotePath(data.currentRemote);
        const colonIdx = data.currentRemote.indexOf(':');
        if (colonIdx > 0) {
          const remoteName = data.currentRemote.slice(0, colonIdx);
          const folder = normalizePath(data.currentRemote.slice(colonIdx + 1));
          setSelectedRemote(remoteName);
          setFolderPath(folder);
          setBrowserPath(folder);
          setShowFolderBrowser(!folder);
        }
      } else if (data.remotes.length === 1) {
        const onlyRemote = data.remotes[0]?.name ?? '';
        setSelectedRemote(onlyRemote);
        setRemotePath(onlyRemote ? `${onlyRemote}:` : '');
        setFolderPath('');
        setBrowserPath('');
        setShowFolderBrowser(true);
      } else {
        setRemotePath('');
        setSelectedRemote('');
        setFolderPath('');
        setBrowserPath('');
        setShowFolderBrowser(true);
      }
    } catch {
      setError('Could not check rclone status.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadEncryptionStatus = useCallback(async () => {
    setLoadingEncryption(true);
    try {
      const data = await api.sync.encryptionStatus();
      setEncryptionStatus(data);
    } catch {
      setError('Could not load backup security status.');
    } finally {
      setLoadingEncryption(false);
    }
  }, []);

  useEffect(() => { loadInfo(); }, [loadInfo]);
  useEffect(() => { loadEncryptionStatus(); }, [loadEncryptionStatus]);

  useEffect(() => {
    onConnectionChange?.(!!info?.currentRemote);
  }, [info?.currentRemote, onConnectionChange]);

  const buildRemotePath = (remote: string, folder: string) =>
    folder ? `${remote}:${folder}` : `${remote}:`;

  const handleRemoteSelect = (remoteName: string) => {
    setSelectedRemote(remoteName);
    setShowProviderPicker(false);
    setShowFolderBrowser(true);
    setTestResult(null);
    setFolderBrowserError('');
    setBrowserPath(normalizePath(folderPath));
    const newPath = buildRemotePath(remoteName, normalizePath(folderPath));
    setRemotePath(newPath);
  };

  const handleFolderChange = (folder: string) => {
    const normalizedFolder = normalizePath(folder);
    setFolderPath(normalizedFolder);
    setShowFolderBrowser(false);
    setTestResult(null);
    if (selectedRemote) {
      setRemotePath(buildRemotePath(selectedRemote, normalizedFolder));
    }
  };

  useEffect(() => {
    if (!selectedRemote) {
      setBrowserFolders([]);
      setFolderBrowserError('');
      return;
    }

    let cancelled = false;

    async function loadFolders() {
      setLoadingFolders(true);
      setFolderBrowserError('');
      try {
        const result = await api.sync.browseFolders(selectedRemote, browserPath);
        if (cancelled) return;
        if (result.ok) {
          setBrowserFolders(result.folders);
        } else {
          setBrowserFolders([]);
          setFolderBrowserError(result.error || 'Could not load folders.');
        }
      } catch (e: unknown) {
        if (cancelled) return;
        setBrowserFolders([]);
        setFolderBrowserError(e instanceof Error ? e.message : 'Could not load folders.');
      } finally {
        if (!cancelled) setLoadingFolders(false);
      }
    }

    loadFolders();
    return () => { cancelled = true; };
  }, [selectedRemote, browserPath]);

  const connectProvider = async (providerId: string) => {
    setConnectingProvider(providerId);
    setError('');
    try {
      const result = await api.sync.setupProvider(providerId);
      if (result.ok && result.remoteName) {
        showSuccess(`Connected to ${providerLabel(providerId)}!`);
        setShowProviderPicker(false);
        await loadInfo();
        handleRemoteSelect(result.remoteName);
      } else {
        setError(result.error || 'Connection failed. Please try again.');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Connection failed');
    } finally {
      setConnectingProvider(null);
    }
  };

  const resetSecurityForm = () => {
    setError('');
    setSecurityMode(null);
    setSecurityPassphrase('');
    setSecurityConfirmPassphrase('');
    setSecurityAcknowledged(false);
  };

  const enableEncryption = async () => {
    const passphrase = securityPassphrase.trim();
    if (!passphrase) {
      setError('Enter a backup passphrase.');
      return;
    }
    if (passphrase !== securityConfirmPassphrase) {
      setError('Passphrase confirmation does not match.');
      return;
    }
    if (!securityAcknowledged) {
      setError('Please confirm that you understand the passphrase cannot be recovered.');
      return;
    }

    setError('');
    setSavingEncryption(true);
    try {
      await api.sync.saveEncryptionPassphrase(passphrase);
      await api.settings.update('backupEncryptionEnabled', true);
      await loadEncryptionStatus();
      resetSecurityForm();
      showSuccess('Encrypted backups are now enabled on this computer.');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to enable backup encryption.');
    } finally {
      setSavingEncryption(false);
    }
  };

  const unlockComputer = async () => {
    const passphrase = securityPassphrase.trim();
    if (!passphrase) {
      setError('Enter your backup passphrase.');
      return;
    }

    setError('');
    setSavingEncryption(true);
    try {
      await api.sync.saveEncryptionPassphrase(passphrase);
      await loadEncryptionStatus();
      resetSecurityForm();
      showSuccess('This computer is now unlocked for encrypted backups.');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save the passphrase for this computer.');
    } finally {
      setSavingEncryption(false);
    }
  };

  const disableEncryption = async () => {
    setError('');
    setSavingEncryption(true);
    try {
      await api.settings.update('backupEncryptionEnabled', false);
      await loadEncryptionStatus();
      resetSecurityForm();
      showSuccess('New backups will no longer be encrypted.');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to update backup encryption.');
    } finally {
      setSavingEncryption(false);
    }
  };

  const forgetPassphrase = async () => {
    setError('');
    setSavingEncryption(true);
    try {
      await api.sync.clearEncryptionPassphrase();
      await loadEncryptionStatus();
      resetSecurityForm();
      showSuccess('Saved backup passphrase removed from this computer.');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to remove saved passphrase.');
    } finally {
      setSavingEncryption(false);
    }
  };

  const testConnection = async () => {
    if (!remotePath) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.sync.testConnection(remotePath);
      setTestResult(result);
    } catch {
      setTestResult({ ok: false, error: 'Connection test failed' });
    } finally {
      setTesting(false);
    }
  };

  const saveConfig = async () => {
    setError('');
    setSaving(true);
    try {
      await api.settings.update('rcloneRemote', remotePath.trim());
      setInfo((prev) => prev ? { ...prev, currentRemote: remotePath.trim() } : prev);
      showSuccess('Sync configuration saved');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const disableSync = async (remoteName: string) => {
    setError('');
    setSaving(true);
    try {
      const isCurrentRemote = info?.currentRemote?.startsWith(`${remoteName}:`) ?? false;
      const isSelectedRemote = selectedRemote === remoteName;
      if (isCurrentRemote) {
        await api.settings.update('rcloneRemote', '');
        // Clear the active sync target immediately.
        setInfo((prev) => (prev
          ? {
            ...prev,
            currentRemote: null,
          }
          : prev));
      }
      // Remove the saved rclone account too. If this fails, keep the account visible.
      await api.sync.deleteRemote(remoteName);
      setInfo((prev) => (prev
        ? {
          ...prev,
          remotes: prev.remotes.filter((r) => r.name !== remoteName),
        }
        : prev));
      if (isSelectedRemote || isCurrentRemote) {
        setRemotePath('');
        setSelectedRemote('');
        setFolderPath('');
        setShowFolderBrowser(true);
        setBrowserPath('');
        setBrowserFolders([]);
        setFolderBrowserError('');
        setTestResult(null);
      }
      setShowProviderPicker(false);
      showSuccess(isCurrentRemote ? 'Disconnected' : 'Account disconnected');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to disconnect');
    } finally {
      setSaving(false);
    }
  };

  // Which providers are already connected (by rclone type)
  const connectedTypes = new Set(info?.remotes.map((r) => r.type) ?? []);

  if (loading) {
    return (
      <div className="card p-6">
        <div className="flex items-center gap-3 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          Checking sync configuration...
        </div>
      </div>
    );
  }

  if (!info?.installed) {
    return (
      <div className="card p-6">
        <div className="flex items-center gap-3 mb-3">
          <CloudOff className="h-5 w-5 text-amber-500" />
          <h2 className="text-lg font-semibold">Database Backup & Sync</h2>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
          <p className="text-sm text-amber-800 font-medium mb-2">rclone is not installed</p>
          <p className="text-sm text-amber-700 mb-3">
            This app uses <a href="https://rclone.org" target="_blank" rel="noopener noreferrer" className="underline font-medium">rclone</a> to
            sync your database to cloud storage. Install it first:
          </p>
          <div className="bg-gray-900 rounded-md p-3 font-mono text-sm text-green-400 space-y-1">
            <p className="text-gray-500"># macOS</p>
            <p>brew install rclone</p>
            <p className="text-gray-500 mt-2"># Linux</p>
            <p>curl https://rclone.org/install.sh | sudo bash</p>
            <p className="text-gray-500 mt-2"># Windows</p>
            <p>winget install Rclone.Rclone</p>
          </div>
        </div>
        <button type="button" onClick={loadInfo} className="btn-secondary btn-sm">
          <RefreshCw className="h-4 w-4" /> Re-check
        </button>
      </div>
    );
  }

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-3">
          <Plug className="h-5 w-5 text-primary-600" />
          <h2 className="text-lg font-semibold">Database Backup & Sync</h2>
        </div>
        {info.version && (
          <span className="text-xs text-gray-400">rclone {info.version}</span>
        )}
      </div>
      <p className="text-sm text-gray-500 mb-5">
        Sync your database to cloud storage so it's backed up and accessible from other machines.
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">{success}</div>
      )}

      {/* Step 1: Choose a remote */}
      <div className="mb-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">1. Choose cloud storage</h3>

        {info.remotes.length > 0 && (
          <div className="mb-3">
            <p className="text-xs text-gray-500 mb-2">Connected accounts:</p>
            <div className="flex flex-wrap gap-2">
              {info.remotes.map((r) => {
                const isActive = selectedRemote === r.name;
                const isSyncTarget = info.currentRemote?.startsWith(`${r.name}:`);
                return (
                  <div key={r.name} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleRemoteSelect(r.name)}
                      className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        isActive
                          ? 'border-primary-500 bg-primary-50 text-primary-700'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <span className="font-semibold">{r.name}</span>
                      <span className="text-gray-400 ml-1.5">({providerLabel(r.type)})</span>
                      {!isSyncTarget && (
                        <span className="ml-1.5 text-xs text-gray-500">connected</span>
                      )}
                      {isSyncTarget && (
                        <span className="ml-1.5 text-xs text-green-600">active</span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => disableSync(r.name)}
                      disabled={saving}
                      className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                      title={isSyncTarget ? 'Disconnect and disable sync' : 'Disconnect account'}
                    >
                      <Unplug className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => setShowProviderPicker(!showProviderPicker)}
          className={`text-sm font-medium ${
            showProviderPicker ? 'text-primary-600' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          + Connect a new cloud account
        </button>
      </div>

      {/* Provider picker with Connect buttons */}
      {showProviderPicker && (
        <div className="mb-5 bg-gray-50 rounded-lg p-4 border border-gray-200">
          {connectingProvider && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 text-sm flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              <div>
                <p className="font-medium">Waiting for authorization...</p>
                <p className="text-blue-600 text-xs mt-0.5">
                  A browser window should open. Log in to your {providerLabel(connectingProvider)} account and authorize access.
                </p>
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {PROVIDERS.map((p) => {
              const alreadyConnected = connectedTypes.has(p.id);
              const isConnecting = connectingProvider === p.id;
              const isDisabled = !!connectingProvider;

              return (
                <div key={p.id} className="bg-white rounded-lg border border-gray-200 p-4 flex flex-col justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{p.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5 mb-3">{p.description}</p>
                  </div>
                  {alreadyConnected ? (
                    <div className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Connected
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => connectProvider(p.id)}
                      disabled={isDisabled}
                      className="btn-primary btn-sm w-full justify-center"
                    >
                      {isConnecting ? (
                        <><Loader2 className="h-4 w-4 animate-spin" /> Authorizing...</>
                      ) : (
                        <><ExternalLink className="h-4 w-4" /> Connect {p.label}</>
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Step 2: Folder path */}
      {selectedRemote && (
        <div className="mb-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">2. Choose a folder on {selectedRemote}</h3>
          <p className="text-xs text-gray-500 mb-2">
            Browse your cloud folders and choose where the database backup should live.
          </p>

          {showFolderBrowser ? (
            <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => setBrowserPath('')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium ${
                    browserPath === ''
                      ? 'bg-primary-100 text-primary-700'
                      : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {selectedRemote}:/
                </button>
                {normalizePath(browserPath).split('/').filter(Boolean).map((segment, idx, parts) => {
                  const segmentPath = parts.slice(0, idx + 1).join('/');
                  return (
                    <div key={segmentPath} className="flex items-center gap-2">
                      <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                      <button
                        type="button"
                        onClick={() => setBrowserPath(segmentPath)}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium ${
                          browserPath === segmentPath
                            ? 'bg-primary-100 text-primary-700'
                            : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        {segment}
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => setBrowserPath(parentPath(browserPath))}
                  disabled={!browserPath}
                  className="btn-secondary btn-sm"
                >
                  Up One Level
                </button>
                <button
                  type="button"
                  onClick={() => handleFolderChange(browserPath)}
                  className="btn-primary btn-sm"
                >
                  Use Current Folder
                </button>
              </div>

              {folderBrowserError && (
                <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {folderBrowserError}
                </div>
              )}

              {loadingFolders ? (
                <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading folders...
                </div>
              ) : browserFolders.length > 0 ? (
                <div className="space-y-2">
                  {browserFolders.map((folder) => {
                    const nextPath = joinPath(browserPath, folder);
                    return (
                      <button
                        key={nextPath}
                        type="button"
                        onClick={() => setBrowserPath(nextPath)}
                        className="w-full flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 text-left hover:border-gray-300 hover:bg-gray-50 transition-colors"
                      >
                        <span className="flex items-center gap-2 text-sm text-gray-700">
                          <Folder className="h-4 w-4 text-primary-500" />
                          {folder}
                        </span>
                        <ChevronRight className="h-4 w-4 text-gray-400" />
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-gray-500 py-2">
                  No subfolders here. You can still use this location.
                </p>
              )}
            </div>
          ) : (
            <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-gray-500 mb-1">Selected folder</p>
                <p className="font-mono text-sm text-gray-700">{folderPath || '/'}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setBrowserPath(folderPath);
                  setShowFolderBrowser(true);
                }}
                className="btn-secondary btn-sm shrink-0"
              >
                Change Folder
              </button>
            </div>
          )}

          {showFolderBrowser && (
            <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
              <p className="text-xs text-gray-500 mb-1">Selected folder</p>
              <p className="font-mono text-sm text-gray-700">{folderPath || '/'}</p>
            </div>
          )}
          {remotePath && (
            <p className="text-xs text-gray-400 mt-1.5 font-mono">
              Full path: {remotePath}
            </p>
          )}
        </div>
      )}

      {/* Step 3: Test & Save */}
      {selectedRemote && (
        <div className="mb-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">3. Test & save</h3>

          {testResult && (
            <div className={`mb-3 p-3 rounded-lg border text-sm flex items-center gap-2 ${
              testResult.ok
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}>
              {testResult.ok
                ? <><CheckCircle2 className="h-4 w-4 shrink-0" /> Connection successful</>
                : <><XCircle className="h-4 w-4 shrink-0" /> {testResult.error || 'Connection failed'}</>
              }
            </div>
          )}

          <div className="flex gap-3 flex-wrap">
            <button
              type="button"
              onClick={testConnection}
              disabled={testing || !remotePath}
              className="btn-secondary btn-sm"
            >
              {testing
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Testing...</>
                : <><Plug className="h-4 w-4" /> Test Connection</>
              }
            </button>
            <button
              type="button"
              onClick={saveConfig}
              disabled={saving || !remotePath}
              className="btn-primary btn-sm"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </div>
      )}

      {/* Current sync target info */}
      {info.currentRemote && (
        <div className="border-t border-gray-200 pt-3 mt-2">
          <p className="text-xs text-gray-400">
            Syncing to: <code className="font-mono bg-gray-100 px-1 py-0.5 rounded">{info.currentRemote}</code>
          </p>
        </div>
      )}

      <div className="border-t border-gray-200 pt-5 mt-5">
        <div className="flex items-center gap-3 mb-1">
          <Shield className="h-5 w-5 text-primary-600" />
          <h3 className="text-lg font-semibold">Backup Security</h3>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Add extra protection to cloud backups with a passphrase. Your backup stays encrypted in the cloud and is decrypted on this computer when you pull it.
        </p>

        {loadingEncryption ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking backup security...
          </div>
        ) : encryptionStatus && (
          <div className="space-y-3">
            {!encryptionStatus.enabled && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-800 mb-1">
                  <Unlock className="h-4 w-4 text-gray-500" />
                  Standard backup
                </div>
                <p className="text-sm text-gray-600 mb-3">
                  Backups are not encrypted right now. Anyone with access to the cloud file could open it.
                </p>

                {securityMode === 'enable' ? (
                  <div className="space-y-3 max-w-lg">
                    <div>
                      <label className="label">Backup passphrase</label>
                      <input
                        type="password"
                        className="input"
                        value={securityPassphrase}
                        onChange={(e) => setSecurityPassphrase(e.target.value)}
                        placeholder="Enter a passphrase"
                      />
                    </div>
                    <div>
                      <label className="label">Confirm passphrase</label>
                      <input
                        type="password"
                        className="input"
                        value={securityConfirmPassphrase}
                        onChange={(e) => setSecurityConfirmPassphrase(e.target.value)}
                        placeholder="Re-enter the passphrase"
                      />
                    </div>
                    <label className="flex items-start gap-2 text-sm text-gray-600">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={securityAcknowledged}
                        onChange={(e) => setSecurityAcknowledged(e.target.checked)}
                      />
                      <span>I understand this passphrase cannot be recovered if it is lost.</span>
                    </label>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={enableEncryption}
                        disabled={savingEncryption}
                        className="btn-primary btn-sm"
                      >
                        <Lock className="h-4 w-4" />
                        {savingEncryption ? 'Saving...' : 'Turn On Encryption'}
                      </button>
                      <button type="button" onClick={resetSecurityForm} className="btn-secondary btn-sm">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      resetSecurityForm();
                      setSecurityMode('enable');
                    }}
                    className="btn-primary btn-sm"
                  >
                    <Lock className="h-4 w-4" />
                    Turn On Encryption
                  </button>
                )}

                {encryptionStatus.hasLocalPassphrase && securityMode !== 'enable' && (
                  <button
                    type="button"
                    onClick={forgetPassphrase}
                    disabled={savingEncryption}
                    className="btn-secondary btn-sm mt-3"
                  >
                    Forget Saved Passphrase On This Computer
                  </button>
                )}
              </div>
            )}

            {encryptionStatus.enabled && encryptionStatus.unlocked && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-green-800 mb-1">
                  <Lock className="h-4 w-4" />
                  Encrypted backup is on
                </div>
                <p className="text-sm text-green-700 mb-3">
                  This computer is unlocked and can encrypt backups on push and decrypt them on pull.
                </p>
                {encryptionStatus.usingEnvPassphrase && (
                  <p className="text-xs text-green-700 mb-3">
                    This computer is currently unlocked by an environment variable.
                  </p>
                )}
                <div className="flex gap-3 flex-wrap">
                  <button
                    type="button"
                    onClick={disableEncryption}
                    disabled={savingEncryption}
                    className="btn-secondary btn-sm"
                  >
                    Turn Off Encryption
                  </button>
                  {encryptionStatus.hasLocalPassphrase && (
                    <button
                      type="button"
                      onClick={forgetPassphrase}
                      disabled={savingEncryption}
                      className="btn-secondary btn-sm"
                    >
                      Forget Saved Passphrase On This Computer
                    </button>
                  )}
                </div>
                <p className="text-xs text-green-700 mt-3">
                  Turning encryption off affects new backups only. The current cloud backup stays encrypted until the next push.
                </p>
              </div>
            )}

            {encryptionStatus.enabled && !encryptionStatus.unlocked && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-amber-800 mb-1">
                  <Lock className="h-4 w-4" />
                  Encrypted backup is on, but this computer is locked
                </div>
                <p className="text-sm text-amber-700 mb-3">
                  Enter the passphrase on this computer to pull encrypted backups and continue pushing securely.
                </p>

                {securityMode === 'unlock' ? (
                  <div className="space-y-3 max-w-lg">
                    <div>
                      <label className="label">Backup passphrase</label>
                      <input
                        type="password"
                        className="input"
                        value={securityPassphrase}
                        onChange={(e) => setSecurityPassphrase(e.target.value)}
                        placeholder="Enter your backup passphrase"
                      />
                    </div>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={unlockComputer}
                        disabled={savingEncryption}
                        className="btn-primary btn-sm"
                      >
                        <Unlock className="h-4 w-4" />
                        {savingEncryption ? 'Saving...' : 'Unlock This Computer'}
                      </button>
                      <button type="button" onClick={resetSecurityForm} className="btn-secondary btn-sm">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-3 flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        resetSecurityForm();
                        setSecurityMode('unlock');
                      }}
                      className="btn-primary btn-sm"
                    >
                      <Unlock className="h-4 w-4" />
                      Unlock This Computer
                    </button>
                    <button
                      type="button"
                      onClick={disableEncryption}
                      disabled={savingEncryption}
                      className="btn-secondary btn-sm"
                    >
                      Turn Off Encryption
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
