# Progress log

Updated by Claude as work proceeds. Newest status at the top of each section.

## Defaults chosen for open decisions (change any of these if you disagree)

- **In-browser SQLite: `sql.js`.** Drizzle has a driver (`drizzle-orm/sql-js`), and it exports the whole DB as bytes, which suits whole-file encryption + cloud upload.
- **Migration tracking stays compatible with drizzle's `__drizzle_migrations` table**, so old the first church databases (once decrypted) open and upgrade in place.
- Open: public/private + license, default storage, hosting, lock service. Not needed yet; I'll build Google Drive first and keep the lock service behind an interface.

## Done

- 2026-11-06: **Google Drive storage** (`storage/googleDrive.ts`, `storage/googleAuth.ts`): redirect OAuth (implicit flow, no Google scripts, works on iPhone), `drive.file` scope, conflict check via `headRevisionId`, previous versions from Drive revisions. If sign-in expires mid-session, the *encrypted* file is parked in IndexedDB and uploaded on the next unlock. Drive “Open with → Fidelia Ledger” (`?state=`) handled for shared files.
- 2026-11-06: **Import from the old app**: `scripts/export-old-db.mjs` writes a plain copy of the SQLite3MultipleCiphers DB (tested on an encrypted sample). “Set up a new church” accepts that file (drag-drop or tap). Old users keep name/role but need a new password from an admin.
- 2026-11-06: Remember last church in this browser (IndexedDB: file handle or Drive file id only).

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

- **Google OAuth client ID** (needs you): create a Google Cloud project, enable the Drive API, create an OAuth client of type “Web application”, add the site origin (and `http://localhost:5173`) as JavaScript origin and `<origin>/` as redirect URI, then put the ID in `.env.local` as `VITE_GOOGLE_CLIENT_ID` (see `.env.example`). For “Open with” from Drive, also configure the Drive UI integration with open URL `<origin>/`. Until then the Drive option is hidden; local files and demo work.

## Next

1. Edit lock (one editor at a time) — Drive-file-based lock first (no server needed), Worker later if needed.
2. Email statements from the browser (Microsoft Graph / Gmail) behind the `Mailer` interface.
3. Hosting config: Cloudflare Pages `_headers` with strict CSP; code-split the bundle.
4. Dropbox adapter.
5. Autosave + versions, edit lock, invites, Drive/Dropbox adapters, browser email, old-DB import.
