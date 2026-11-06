// Ported from the old server app: src/server/routes/settings.ts.
// Values are stored as text; JSON values are parsed on read.
import { settings } from '../../db/schema';
import type { AppDb } from './db';
import { DataError } from './session';

export const KNOWN_KEYS = [
  'congregationOptions', 'offeringMethodOptions', 'churchName', 'churchAddress1', 'churchCity',
  'churchState', 'churchZip', 'churchPhone', 'letterSigningName', 'letterSigningTitle',
  'donorLetterTemplate', 'statementEmailTemplate',
] as const;
export type SettingKey = (typeof KNOWN_KEYS)[number];

/** Defaults for a brand-new church. Congregations start empty; each church sets its own. */
export const DEFAULT_SETTINGS: Record<SettingKey, unknown> = {
  congregationOptions: [],
  offeringMethodOptions: [
    { value: 'cash', label: 'Cash' },
    { value: 'check', label: 'Check' },
    { value: 'zelle', label: 'Zelle' },
    { value: 'paypal', label: 'PayPal' },
    { value: 'venmo', label: 'Venmo' },
    { value: 'paypal_giving', label: 'PayPal Giving' },
    { value: 'charitable', label: 'Charitable' },
    { value: 'other', label: 'Other' },
    { value: 'import', label: 'Import' },
  ],
  churchName: '',
  churchAddress1: '',
  churchCity: '',
  churchState: '',
  churchZip: '',
  churchPhone: '',
  letterSigningName: '',
  letterSigningTitle: '',
  donorLetterTemplate: '',
  statementEmailTemplate: '',
};

export function getAllSettings(db: AppDb): Record<string, unknown> {
  const result: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const row of db.select().from(settings).all()) {
    try {
      result[row.key] = JSON.parse(row.value);
    } catch {
      result[row.key] = row.value;
    }
  }
  return result;
}

export function updateSetting(db: AppDb, key: string, value: unknown) {
  if (!KNOWN_KEYS.includes(key as SettingKey)) throw new DataError(`Unknown setting key: ${key}`);
  if (value === undefined || value === null) throw new DataError('value is required');
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  const now = new Date().toISOString();
  db.insert(settings)
    .values({ key, value: serialized, updatedAt: now })
    .onConflictDoUpdate({ target: settings.key, set: { value: serialized, updatedAt: now } })
    .run();
  return { ok: true };
}
