// A diagnostics report the treasurer can copy and send to the developer.
// Contains only counts, versions and scrubbed error text: no names, emails or amounts.
import type { Church } from './church';
import { getSchemaVersion, LATEST_SCHEMA } from '../data/migrations';
import { integrityCheck } from '../data/db';

/** Removes things that could identify people: emails, long numbers, quoted text. */
export function scrub(text: string): string {
  return text
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '<email>')
    .replace(/\d[\d\s().-]{5,}\d/g, '<number>')
    .replace(/"[^"]*"|'[^']*'|“[^”]*”/g, '<text>')
    .slice(0, 500);
}

const TABLES = ['donors', 'categories', 'batches', 'offerings', 'pledges', 'settings', 'statement_emails', 'users'];

export function diagnostics(church: Church, extra: { appVersion: string; userAgent: string }) {
  const raw = church.opened.raw;
  const counts: Record<string, number> = {};
  for (const t of TABLES) {
    try { counts[t] = Number(raw.exec(`SELECT count(*) FROM ${t}`)[0]?.values[0]?.[0] ?? 0); } catch { counts[t] = -1; }
  }
  return {
    generatedAt: new Date().toISOString(),
    appVersion: extra.appVersion,
    userAgent: extra.userAgent,
    storage: church.adapter.kind,
    role: church.user?.role ?? 'recovery',
    schema: { file: getSchemaVersion(raw), app: LATEST_SCHEMA, readOnly: church.opened.readOnly },
    integrity: integrityCheck(raw) ? 'ok' : 'FAILED',
    saveState: church.state,
    lastError: church.lastError ? scrub(String((church.lastError as Error).message ?? church.lastError)) : null,
    lockedByOther: church.lockedBy !== null,
    counts,
  };
}
