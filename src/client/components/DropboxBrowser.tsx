// In-app Dropbox browser: our own page calling the Dropbox API, so it works in every browser
// (no third-party frame or script). Shows folders and church files only.
import { useEffect, useState, type FormEvent } from 'react';
import { ChevronLeft, FileLock2, Folder, FolderPlus, Loader2, Users } from 'lucide-react';
import { createDropboxFolder, listDropboxFolder, parentOf, type DropboxEntry } from '../storage/dropbox';

export function DropboxBrowser(p: {
  /** 'folder': choose where to keep a new church; 'file': choose an existing church file. */
  mode: 'folder' | 'file';
  /** Folder to start in ("" = top of Dropbox). */
  start?: string;
  onPick: (path: string) => void;
  onCancel: () => void;
}) {
  const [path, setPath] = useState(p.start ?? '');
  const [entries, setEntries] = useState<DropboxEntry[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setEntries(null); setError('');
    listDropboxFolder(path).then(
      (e) => { if (live) setEntries(e); },
      (e) => {
        if (!live) return;
        // A remembered start folder may be gone: fall back to the top.
        if (path && (e as { status?: number }).status === 409) setPath('');
        else setError((e as Error).message);
      },
    );
    return () => { live = false; };
  }, [path]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const made = await createDropboxFolder(path, newName ?? '');
      setNewName(null);
      setPath(made);
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };

  const crumbs = path.split('/').filter(Boolean);
  const files = entries?.filter((x) => x.kind === 'file') ?? [];

  return (
    <div className="rounded-xl border border-gray-200 bg-white text-sm text-gray-800">
      <div className="flex items-center gap-1 border-b border-gray-100 px-2 py-2">
        <button type="button" className="p-1 rounded hover:bg-gray-100 disabled:opacity-30" disabled={!path} onClick={() => setPath(parentOf(path))} aria-label="Up one folder">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1 truncate">
          <button type="button" className="hover:underline" onClick={() => setPath('')}>Dropbox</button>
          {crumbs.map((c, i) => (
            <span key={i}> / <button type="button" className="hover:underline" onClick={() => setPath(`/${crumbs.slice(0, i + 1).join('/')}`)}>{c}</button></span>
          ))}
        </div>
      </div>

      <ul className="max-h-64 overflow-y-auto">
        {!entries && !error && <li className="flex items-center gap-2 px-3 py-3 text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</li>}
        {entries?.length === 0 && <li className="px-3 py-3 text-gray-500">{p.mode === 'file' ? 'No folders or church files here.' : 'This folder is empty.'}</li>}
        {entries?.map((x) => (
          <li key={x.path}>
            <button type="button" disabled={p.mode === 'folder' && x.kind === 'file'}
              onClick={() => (x.kind === 'folder' ? setPath(x.path) : p.onPick(x.path))}
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-primary-50 disabled:hover:bg-transparent disabled:text-gray-400">
              {x.kind === 'folder'
                ? (x.shared ? <Users className="h-4 w-4 text-primary-600" /> : <Folder className="h-4 w-4 text-primary-600" />)
                : <FileLock2 className="h-4 w-4 text-amber-600" />}
              <span className="truncate">{x.name}</span>
            </button>
          </li>
        ))}
      </ul>

      {error && <p className="px-3 py-2 text-red-600">{error}</p>}
      {p.mode === 'folder' && files.length > 0 && (
        <p className="px-3 py-2 text-xs text-amber-700 bg-amber-50">This folder already has a church file. To use that church, go back and sign in instead.</p>
      )}

      <div className="space-y-2 border-t border-gray-100 p-2">
        {p.mode === 'folder' && (newName === null ? (
          <button type="button" className="btn-secondary btn-sm w-full" onClick={() => setNewName('')}><FolderPlus className="h-4 w-4" /> New folder here</button>
        ) : (
          <form onSubmit={create} className="flex gap-2">
            <input className="input py-1 flex-1 min-w-0" autoFocus placeholder="Folder name, e.g. Fidelia" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <button className="btn-secondary btn-sm" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create'}</button>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setNewName(null)}>Cancel</button>
          </form>
        ))}
        <div className="flex gap-2">
          {p.mode === 'folder' && (
            <button type="button" className="btn-primary btn-sm flex-1" disabled={!entries} onClick={() => p.onPick(path)}>
              Use {path ? `“${crumbs[crumbs.length - 1]}”` : 'the top of Dropbox'}
            </button>
          )}
          <button type="button" className="btn-secondary btn-sm" onClick={p.onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
