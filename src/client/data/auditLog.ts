// Audit log inside the encrypted church file (the old app kept it in a separate DB).
import { and, count, desc, eq, gte, lte, lt, sql } from 'drizzle-orm';
import { auditLog } from '../../db/schema';
import type { AppDb } from './db';

export const AUDIT_KEEP = 5000;

/** Entries are stored as UTC 'YYYY-MM-DD HH:MM:SS'; filters are the user's local dates. */
export function localDayToUtc(day: string, time: string) {
  const d = new Date(`${day}T${time}`);
  return Number.isNaN(d.getTime()) ? `${day} ${time}` : d.toISOString().slice(0, 19).replace('T', ' ');
}

export interface AuditEntry {
  username: string;
  action: string;
  resource?: string | null;
  resourceId?: number | null;
  detail?: string | null;
}

/** Records an entry and keeps only the newest AUDIT_KEEP rows. Never throws. */
export function writeAudit(db: AppDb, e: AuditEntry) {
  try {
    const row = db.insert(auditLog).values({
      username: e.username || 'unknown',
      action: e.action,
      resource: e.resource ?? null,
      resourceId: e.resourceId ?? null,
      detail: e.detail?.slice(0, 500) ?? null,
    }).returning({ id: auditLog.id }).get();
    if (row && row.id > AUDIT_KEEP && row.id % 100 === 0) db.delete(auditLog).where(lt(auditLog.id, row.id - AUDIT_KEEP + 1)).run();
  } catch {
    // An audit failure must never block the user's change.
  }
}

export function listAudit(
  db: AppDb,
  p: { startDate?: string; endDate?: string; username?: string; action?: string; limit?: number; offset?: number } = {},
) {
  const c = [];
  if (p.startDate) c.push(gte(auditLog.at, localDayToUtc(p.startDate, '00:00:00')));
  if (p.endDate) c.push(lte(auditLog.at, localDayToUtc(p.endDate, '23:59:59')));
  if (p.username) c.push(eq(auditLog.username, p.username));
  if (p.action) c.push(eq(auditLog.action, p.action));
  const where = c.length ? and(...c) : undefined;
  const rows = db
    .select({
      id: auditLog.id,
      userId: sql<null>`null`,
      username: auditLog.username,
      action: auditLog.action,
      resource: auditLog.resource,
      resourceId: auditLog.resourceId,
      detail: auditLog.detail,
      ip: sql<null>`null`,
      createdAt: auditLog.at,
    })
    .from(auditLog)
    .where(where)
    .orderBy(desc(auditLog.id))
    .limit(Number(p.limit ?? 200))
    .offset(Number(p.offset ?? 0))
    .all();
  const total = db.select({ n: count() }).from(auditLog).where(where).get()?.n ?? 0;
  const usernames = db.selectDistinct({ u: auditLog.username }).from(auditLog).orderBy(auditLog.username).all().map((r) => r.u);
  return { rows, total, usernames };
}
