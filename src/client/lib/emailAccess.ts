// Who sees "Email Statements". While the feature is private, only churches listed in
// VITE_EMAIL_CHURCHES (comma-separated support IDs) get it; "*" opens it to every church.
// The demo never gets it. This only hides the button: it is not a security boundary.
import { useEffect, useState } from 'react';
import type { Church } from '../church/church';

/** A church's support ID: a short hash of its random church ID, safe to share and to list in config. */
export async function supportId(churchId: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`fidelia:support:${churchId}`));
  return [...new Uint8Array(buf)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Parses the allow-list setting. Empty = nobody, "*" = everybody. */
export function parseAllowList(raw: string | undefined): Set<string> | '*' {
  const s = (raw ?? '').trim();
  if (s === '*') return '*';
  return new Set(s.split(/[\s,]+/).map((x) => x.trim().toLowerCase()).filter(Boolean));
}

export function emailAllowed(opts: { isDemo: boolean; supportId: string; allow: Set<string> | '*' }): boolean {
  if (opts.isDemo) return false;
  return opts.allow === '*' || opts.allow.has(opts.supportId.toLowerCase());
}

const ALLOW = parseAllowList(import.meta.env.VITE_EMAIL_CHURCHES);

export const isDemoChurch = (church: Church | null) => church?.adapter.kind === 'memory';

/** The open church's support ID (null until worked out, or with no church open). */
export function useSupportId(church: Church | null): string | null {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setId(null);
    if (church) void supportId(church.churchId).then((v) => { if (live) setId(v); });
    return () => { live = false; };
  }, [church]);
  return id;
}

/** True when the open church may use Email Statements. */
export function useEmailAllowed(church: Church | null): boolean {
  const id = useSupportId(church);
  return !!church && !!id && emailAllowed({ isDemo: isDemoChurch(church), supportId: id, allow: ALLOW });
}
