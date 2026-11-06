# Progress log

Updated by Claude as work proceeds. Newest status at the top of each section.

## Defaults chosen for open decisions (change any of these if you disagree)

- **In-browser SQLite: `sql.js`.** Drizzle has a driver (`drizzle-orm/sql-js`), and it exports the whole DB as bytes, which suits whole-file encryption + cloud upload.
- **Migration tracking stays compatible with drizzle's `__drizzle_migrations` table**, so old the first church databases (once decrypted) open and upgrade in place.
- Open: public/private + license, default storage, hosting, lock service. Not needed yet; I'll build Google Drive first and keep the lock service behind an interface.

## Done

- 2026-11-06: **Audit log inside the encrypted file**: migration `0011_audit_log_local` (tested: fresh DBs and upgrades from older schemas), `data/auditLog.ts` (keeps newest 5000), every API write and member/recovery-key/restore action recorded with the user's name. Audit Log page restored for admins (IP column removed; date filters in local time).

- 2026-11-06: Writes are refused up front in read-only sessions (viewer, newer schema, or someone else editing). Phone layout: sidebar starts icons-only under 768px; tighter padding.

- 2026-11-06: Dependencies: removed unused `xlsx`; upgraded drizzle-orm 0.45 (SQL identifier advisory), drizzle-kit 0.31, react-router 7. `npm audit --omit=dev`: 0 vulnerabilities. Re-checked in the browser.

- 2026-11-06: **Dropbox storage** (`storage/dropbox.ts`): PKCE redirect sign-in with refresh token (no mid-session redirects), conflict detection by Dropbox (`update` mode with rev), versions from Dropbox revisions, edit lock in a sibling `.lock` file. Needs `VITE_DROPBOX_APP_KEY`.
- 2026-11-06: Scrubbed diagnostics (Data & Backup → Copy diagnostics). Docs: `docs/deploy.md`, `docs/treasurer-guide.md`, README.

- 2026-11-06: **Edit lock** (`church/lock.ts`): lock in the Drive file's `appProperties`, 3-min expiry, 1-min heartbeat, write-then-verify. Others get a read-only banner with “Try again”; taking the lock reloads the latest file. Save-time revision check remains the backstop.
- 2026-11-06: **Email statements from the browser** (`mail/microsoft.ts`, `mail/gmail.ts`): popup OAuth (`public/oauth-callback.html`) so the open session survives; Microsoft = auth code + PKCE → Graph `/me/sendMail`; Gmail = `gmail.send` MIME. Sign-in buttons in the Email Statements dialog. Sending stays resumable (per-donor status in the DB).
- 2026-11-06: **Hosting hardening**: `public/_headers` (strict CSP: scripts only from self; network only to Google/Microsoft APIs), `_redirects` SPA fallback, OCR assets self-hosted (`scripts/vendor-ocr.mjs` runs before dev/build), pages lazy-loaded (main bundle 943→373 KB).

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

- **Microsoft app registration** (needs you, only for M365 sending): Entra app, platform “Single-page application”, redirect `<origin>/oauth-callback.html`, delegated `Mail.Send`. Put the ID in `VITE_MS_CLIENT_ID`.
- **Dropbox app key** (needs you, optional): see `.env.example`.
- **Google OAuth client ID** (needs you): create a Google Cloud project, enable the Drive API, create an OAuth client of type “Web application”, add the site origin (and `http://localhost:5173`) as JavaScript origin and `<origin>/` as redirect URI, then put the ID in `.env.local` as `VITE_GOOGLE_CLIENT_ID` (see `.env.example`). For “Open with” from Drive, also configure the Drive UI integration with open URL `<origin>/`. Until then the Drive option is hidden; local files and demo work.

## Bugs

- **Members page: "add a second admin" warning shows after import even with 2 admins** (reported 2026-11-06). Cause: `Members.tsx` counts only admins who have a password (`hasPassword`), and admins imported from the old app have none until someone sets one. The count is arguably right (that admin can't sign in yet) but the message is misleading. Fix: when admins without passwords exist, say “Set a password for <name> so they can sign in”, and add a “No password yet” badge in the list.

## Next

1. Visual check of the phone layout on a real iPhone (the automated browser could not resize its viewport).
2. End-to-end check with real Google/Microsoft/Dropbox accounts once client IDs exist (blocked, see above).

The auto-resume job was cancelled on 2026-11-06 because only items needing the author remain (plus the Members bug, held at the author's request).
