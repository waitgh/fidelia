import { describe, it, expect } from 'vitest';
import { openDatabase, exportDatabase, loadSqlJs } from './db';
import { MIGRATIONS, LATEST_SCHEMA, getSchemaVersion } from './migrations';
import * as R from './reports';
import { getBatch } from './batches';
import { buildFundMethodTable } from '../../shared/lib/fundMethodTable';

/** A church file as saved by the app before designation/attendance existed (schema 0011). */
async function fileAtPreviousSchema() {
  const SQL = await loadSqlJs();
  const db = new SQL.Database();
  db.run('CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, hash text NOT NULL, created_at numeric)');
  const prev = MIGRATIONS.filter((m) => m.tag !== '0012_designation_attendance');
  for (const m of prev) {
    for (const s of m.statements) db.run(s);
    db.run('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)', ['x', m.when]);
  }
  db.run(`INSERT INTO donors (id, first_name, last_name, congregation) VALUES (1,'Amy','Wang','English'),(2,'Bob','Li','Mandarin')`);
  db.run(`INSERT INTO categories (id, name) VALUES (1,'General'),(2,'Mission')`);
  db.run(`INSERT INTO batches (id, date, description, status) VALUES (1,'2026-11-22','Sunday','closed')`);
  db.run(`INSERT INTO offerings (batch_id, donor_id, category_id, amount, fee_amount, payment_method, check_number, notes) VALUES
    (1,1,1,100,NULL,'check','101','for Smith'),(1,2,2,50.1,NULL,'cash',NULL,NULL),(1,2,1,200,4.08,'paypal',NULL,NULL)`);
  return db.export();
}

describe('migration 0012 (designation + attendance)', () => {
  it('only adds columns; existing data and every total are unchanged', async () => {
    const opened = await openDatabase(await fileAtPreviousSchema());
    expect(getSchemaVersion(opened.raw)).toBe(LATEST_SCHEMA);
    expect(opened.readOnly).toBe(false);
    const { db } = opened;

    const b = getBatch(db, 1);
    expect(b).toMatchObject({ date: '2026-11-22', description: 'Sunday', status: 'closed', attendanceAdults: null, attendanceChildren: null });
    expect(b.offerings.map((o) => [o.amount, o.feeAmount, o.paymentMethod, o.checkNumber, o.notes, o.designation])).toEqual(
      expect.arrayContaining([[100, null, 'check', '101', 'for Smith', null], [50.1, null, 'cash', null, null, null], [200, 4.08, 'paypal', null, null, null]]),
    );
    expect(b.totalAmount).toBe(350.1);

    const s = R.congregationSummary(db, '2026-01-01', '2026-12-31');
    expect(s.grandTotal).toBe(350.1);
    expect(s.totalOfferings).toBe(3);
    const t = buildFundMethodTable(s.fundMethod, ['cash', 'check', 'paypal']);
    expect(t.totals.total).toEqual({ amount: 350.1, count: 3, fees: 4.08 });
    expect(t.rows.every((r) => r.designations.length === 0)).toBe(true);

    expect(R.donorStatement(db, 2, '2026-01-01', '2026-12-31').totalsByCategory).toEqual({ General: 200, Mission: 50.1 });

    // Saves and reopens cleanly at the new schema.
    const again = await openDatabase(exportDatabase(opened));
    expect(getBatch(again.db, 1).totalAmount).toBe(350.1);
  });
});
