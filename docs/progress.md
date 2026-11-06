# Progress log

Updated by Claude as work proceeds. Newest status at the top of each section.

## Defaults chosen for open decisions (change any of these if you disagree)

- **In-browser SQLite: `sql.js`.** Drizzle has a driver (`drizzle-orm/sql-js`), and it exports the whole DB as bytes, which suits whole-file encryption + cloud upload.
- **Migration tracking stays compatible with drizzle's `__drizzle_migrations` table**, so old the first church databases (once decrypted) open and upgrade in place.
- Open: public/private + license, default storage, hosting, lock service. Not needed yet; I'll build Google Drive first and keep the lock service behind an interface.

## Done

- 2026-11-06: Ported all data areas behind `api.ts` to `src/client/data/` with tests: categories, donors, batches, offerings, pledges, settings, reports (statement/congregation/dashboard/trends), statement-email recipients and send bookkeeping. `api.ts` now uses `read()`/`write()` helpers; writes call `markDirty()` (for autosave).
  - Fixed: non-Latin (Chinese) donor search used to match every donor.
  - Settings: dropped `rcloneRemote`/`backupEncryptionEnabled`; new churches start with no congregations.
  - Audit log not ported yet (old app kept it in a separate DB). Mail goes through a `Mailer` interface (`src/client/mail/types.ts`); providers come later.

- 2026-11-06: `src/client/data/db.ts` + `migrations.ts`: open/migrate/export with sql.js + Drizzle; a newer-schema file opens read-only and refuses export; `PRAGMA integrity_check` before export. Tests in `db.test.ts`.
- 2026-11-06: `src/client/storage/`: `StorageAdapter` interface, `MemoryAdapter` (tests/demo), `LocalFileAdapter` (File System Access API, dev).

## Blocked on

- Nothing yet.

## Next

1. Envelope encryption + recovery key (with round-trip tests).
2. Church session: create/unlock a church file, autosave, replace Login/Sync pages.
3. Autosave + versions, edit lock, invites, Drive/Dropbox adapters, browser email, old-DB import.
