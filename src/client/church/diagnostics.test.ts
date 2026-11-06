import { describe, it, expect } from 'vitest';
import { scrub, diagnostics } from './diagnostics';
import { Church } from './church';
import { MemoryAdapter } from '../storage/memory';
import { createDonor } from '../data/donors';

describe('diagnostics', () => {
  it('scrubs emails, numbers and quoted text', () => {
    expect(scrub('Failed for amy@x.org "Amy Wang" phone 703-555-1234')).toBe('Failed for <email> <text> phone <number>');
  });
  it('reports counts without personal data', async () => {
    Church.lockSettleMs = 0;
    const { church } = await Church.create(new MemoryAdapter(), { churchName: 'Grace', username: 'tom', displayName: 'Tom Secret', password: 'password1' });
    createDonor(church.opened.db, { firstName: 'Amy', lastName: 'Wang', email: 'amy@x.org' });
    const d = diagnostics(church, { appVersion: '0.1.0', userAgent: 'test' });
    expect(d.counts.donors).toBe(1);
    expect(d.integrity).toBe('ok');
    const text = JSON.stringify(d);
    for (const pii of ['Amy', 'Wang', 'amy@x.org', 'Tom Secret', 'Grace']) expect(text).not.toContain(pii);
  });
});
