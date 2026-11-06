import { describe, it, expect } from 'vitest';
import { openDatabase } from './db';
import { writeAudit, listAudit, AUDIT_KEEP, localDayToUtc } from './auditLog';

describe('audit log', () => {
  it('records, filters and lists newest first', async () => {
    const { db } = await openDatabase();
    writeAudit(db, { username: 'ann', action: 'create_donor', resource: 'donor', resourceId: 1, detail: 'A B' });
    writeAudit(db, { username: 'bob', action: 'close_batch', resource: 'batch', resourceId: 2 });
    const all = listAudit(db);
    expect(all.total).toBe(2);
    expect(all.rows.map((r) => r.action)).toEqual(['close_batch', 'create_donor']);
    expect(all.usernames).toEqual(['ann', 'bob']);
    expect(listAudit(db, { username: 'ann' }).total).toBe(1);
    expect(listAudit(db, { action: 'close_batch' }).rows[0]!.resourceId).toBe(2);
    expect(listAudit(db, { endDate: '2000-01-01' }).total).toBe(0);
  });
  it('prunes to the newest entries', async () => {
    const { db } = await openDatabase();
    for (let i = 0; i < AUDIT_KEEP + 200; i++) writeAudit(db, { username: 'u', action: 'x', resourceId: i });
    const { total, rows } = listAudit(db, { limit: 1 });
    expect(total).toBeLessThanOrEqual(AUDIT_KEEP);
    expect(rows[0]!.resourceId).toBe(AUDIT_KEEP + 199);
  });
});

describe('localDayToUtc', () => {
  it('converts a local day boundary to the stored UTC format', () => {
    const v = localDayToUtc('2026-11-06', '23:59:59');
    expect(v).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(new Date(v.replace(' ', 'T') + 'Z').getTime()).toBe(new Date('2026-11-06T23:59:59').getTime());
  });
});
