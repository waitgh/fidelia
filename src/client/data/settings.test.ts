import { describe, it, expect } from 'vitest';
import { openDatabase } from './db';
import { getAllSettings, updateSetting } from './settings';

describe('settings', () => {
  it('returns defaults, stores strings and JSON, rejects unknown keys', async () => {
    const { db } = await openDatabase();
    expect(getAllSettings(db).churchName).toBe('');
    expect(Array.isArray(getAllSettings(db).offeringMethodOptions)).toBe(true);
    updateSetting(db, 'churchName', 'Grace Church');
    updateSetting(db, 'congregationOptions', ['English', 'Mandarin']);
    updateSetting(db, 'churchName', 'Grace Chapel');
    const s = getAllSettings(db);
    expect(s.churchName).toBe('Grace Chapel');
    expect(s.congregationOptions).toEqual(['English', 'Mandarin']);
    expect(() => updateSetting(db, 'bogus', 1)).toThrow('Unknown');
    expect(() => updateSetting(db, 'churchName', null)).toThrow('required');
  });
});
