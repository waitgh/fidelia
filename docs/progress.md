# Progress log

Updated by Claude as work proceeds. Newest status at the top of each section.

## Defaults chosen for open decisions (change any of these if you disagree)

- **In-browser SQLite: `sql.js`.** Drizzle has a driver (`drizzle-orm/sql-js`), and it exports the whole DB as bytes, which suits whole-file encryption + cloud upload.
- **Migration tracking stays compatible with drizzle's `__drizzle_migrations` table**, so old the first church databases (once decrypted) open and upgrade in place.
- Open: public/private + license, default storage, hosting, lock service. Not needed yet; I'll build Google Drive first and keep the lock service behind an interface.

## Done

- 2026-11-06: **App runs fully in the browser with no backend.** Verified in Chrome: demo → dashboard, donors, batches, pledges, reports, Data & Backup, Members, with no console errors.
  - `src/client/crypto/envelope.ts`: file format `FIDELIA\x01` + JSON header (key slots) + AES-256-GCM body (gzip). PBKDF2-SHA256 600k per password slot; recovery key = 26 base32 chars. Username stored only as a salted hash hint.
  - `src/client/church/church.ts`: create/unlock/recover, members (stored in the existing `users` table; `password_hash` now holds the slot hint), debounced autosave, integrity check before every save, version restore.
  - New pages: Welcome (`Login.tsx`), `Members.tsx`, `DataBackup.tsx`. Removed Sync, SyncSetup, Users, AuditLog pages and all `fetch('/api')` code.
  - Removed the Google Fonts import (third-party request).

- 2026-11-06: Ported all data areas behind `api.ts` to `src/client/data/` with tests: categories, donors, batches, offerings, pledges, settings, reports (statement/congregation/dashboard/trends), statement-email recipients and send bookkeeping. `api.ts` now uses `read()`/`write()` helpers; writes call `markDirty()` (for autosave).
  - Fixed: non-Latin (Chinese) donor search used to match every donor.
  - Settings: dropped `rcloneRemote`/`backupEncryptionEnabled`; new churches start with no congregations.
  - Audit log not ported yet (old app kept it in a separate DB). Mail goes through a `Mailer` interface (`src/client/mail/types.ts`); providers come later.

- 2026-11-06: `src/client/data/db.ts` + `migrations.ts`: open/migrate/export with sql.js + Drizzle; a newer-schema file opens read-only and refuses export; `PRAGMA integrity_check` before export. Tests in `db.test.ts`.
- 2026-11-06: `src/client/storage/`: `StorageAdapter` interface, `MemoryAdapter` (tests/demo), `LocalFileAdapter` (File System Access API, dev).

## Blocked on

- Nothing yet.

## Next

1. Remember the last church in this browser (store file handle in IndexedDB).
2. Google Drive adapter (`drive.file`, redirect OAuth), then Dropbox.
3. Import an old the first church database (plain SQLite export).
4. Autosave + versions, edit lock, invites, Drive/Dropbox adapters, browser email, old-DB import.
