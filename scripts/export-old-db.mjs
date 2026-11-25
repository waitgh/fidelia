#!/usr/bin/env node
// One-time migration helper: writes a plain (unencrypted) SQLite copy of an old
// Fidelia Ledger database so it can be imported in the browser app, which then
// encrypts it as a church file. Run on the treasurer's own computer; delete the
// plain copy after importing.
//
//   DB_ENCRYPTION_KEY=... node scripts/export-old-db.mjs ../old-app/data/bookkeeping.db old-plain.db
//
// Uses better-sqlite3-multiple-ciphers from the old repo's node_modules.
import { createRequire } from 'module';
import { existsSync } from 'fs';
import path from 'path';

const [src, out] = process.argv.slice(2);
if (!src || !out) {
  console.error('Usage: DB_ENCRYPTION_KEY=... node scripts/export-old-db.mjs <old.db> <plain-out.db>');
  process.exit(1);
}
if (existsSync(out)) { console.error(`${out} already exists`); process.exit(1); }
const oldRepo = process.env.OLD_REPO ? path.resolve(process.env.OLD_REPO) : path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../old-app');
const Database = createRequire(path.join(oldRepo, 'package.json'))('better-sqlite3');

const db = new Database(out); // plain
const key = process.env.DB_ENCRYPTION_KEY ?? '';
db.prepare('ATTACH DATABASE ? AS enc KEY ?').run(path.resolve(src), key);
const objects = db.prepare(
  "SELECT type, name, sql FROM enc.sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END",
).all();
db.exec('BEGIN');
for (const o of objects) {
  db.exec(o.sql);
  if (o.type === 'table') db.exec(`INSERT INTO main."${o.name}" SELECT * FROM enc."${o.name}"`);
}
db.exec('COMMIT');
db.exec('DETACH DATABASE enc');
const ok = db.prepare('PRAGMA integrity_check').get();
const counts = objects.filter((o) => o.type === 'table').map((o) => `${o.name}=${db.prepare(`SELECT count(*) n FROM "${o.name}"`).get().n}`);
db.close();
console.log(`Wrote ${out} (${Object.values(ok)[0]}): ${counts.join(', ')}`);
