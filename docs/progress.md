# Progress log

Updated by Claude as work proceeds. Newest status at the top of each section.

## Defaults chosen for open decisions (change any of these if you disagree)

- **In-browser SQLite: `sql.js`.** Drizzle has a driver (`drizzle-orm/sql-js`), and it exports the whole DB as bytes, which suits whole-file encryption + cloud upload.
- **Migration tracking stays compatible with drizzle's `__drizzle_migrations` table**, so old the first church databases (once decrypted) open and upgrade in place.
- Open: public/private + license, default storage, hosting, lock service. Not needed yet; I'll build Google Drive first and keep the lock service behind an interface.

## Done

- 2026-11-23: **Fix: “Different church” on the sign-in page reopened the same church.** It reused the existing Dropbox/Drive sign-in, and when that account held only one church file it opened it straight away. “Different church” now always shows the list of church files (flag `fidelia.chooseChurch` in sessionStorage, survives the sign-in redirect, cleared on sign-in or Back). The Dropbox chooser also has **Use a different Dropbox account**: revokes the token and sends the user back to Dropbox with `force_reapprove=true`.
- 2026-11-23: **Batch → Export (CSV) and Batches → Import CSV (round trip).** Export button on every batch page, for all roles (read-only). One row per offering (date, description, donor, congregation, category, method, check #, amount, fee, net, notes) plus a Total row; amounts are plain numbers so Excel can sum them. UTF-8 BOM so Chinese names open correctly in Excel; text cells starting with `= + - @` get a leading `'` (removed again on import). Import (Batches page, not viewers) reads that same file back: preview first, then creates one new *open* batch per date + description, all in one transaction, all-or-nothing. Donors matched by first + last name (congregation breaks ties; still ambiguous = error); donors not found are added and listed in the preview. Categories and methods must already exist. Fees are recalculated, not read from the file. Accepts Excel's re-saved `M/D/YYYY` dates and `$1,250.00` amounts. Warns (doesn't block) when a matching batch already exists. `lib/batchExport.ts`, `data/batchImport.ts`, round-trip tests in `data/batchImport.test.ts`.
- 2026-11-17: **Refreshing no longer asks for the password** (`church/resume.ts`). After unlocking, the data key is encrypted with a random non-extractable AES key kept in IndexedDB; the encrypted key, expiry and file location go in this tab's sessionStorage. Neither half works alone. The expiry slides with activity and matches the 15-minute idle sign-out; sign-out (manual or idle) deletes both, closing the tab drops the sessionStorage half, and orphaned IndexedDB keys are swept after a day. Resume re-checks that the member still has a password slot and is active. Not used for the demo; local files resume only if Chrome still grants file permission without a prompt. Confirmed working on the live site by the author (a session started before the deploy needs one fresh sign-in).

- 2026-11-17: **Donors → Import CSV.** Header names are matched loosely (`first_name`, `First Name`, `firstName` all work). One transaction; skips rows with no name, envelope numbers already in use, and exact duplicates (name + email + phone + address), so re-importing a file adds nothing. Used to bring the first church's donors over from the old app (`sqlite3 -header -csv` on `bookkeeping.db`).

- 2026-11-15: **User guide PDF** for non-technical treasurers: `docs/user-guide/Fidelia-User-Guide.pdf` (9 pages: setup with Dropbox, inviting treasurers, signing in, recording a batch, donors/pledges/funds, reports, good to know, troubleshooting). Rebuild with `docs/user-guide/make_guide.py` (screenshots from the demo). Also fixed: the demo showed both the default funds and its own sample funds; it now reuses General/Building/Mission and adds Lunch.

- 2026-11-15: **In-app Dropbox browser** (`components/DropboxBrowser.tsx`): our own page calling the Dropbox API, so it works in every browser. Create account → Dropbox → "Choose or create a folder" (browse, New folder, Use this folder; file name separate; typing a full path is still available). Sign in → Dropbox → "Browse my Dropbox" to pick a church file. Shared folders show a people icon. Warns when a chosen folder already holds a church file. Helpers `listDropboxFolder`, `createDropboxFolder`, `joinPath`, `parentOf`, `folderNameProblem` with tests. Verified on localhost with the author's Dropbox (listing, new folder, choose); the temporary folder was removed.

- 2026-11-15: Dropbox app "Fidelia Ledger" created (key `0gg3b3e9dgqgne6`, development status, additional users enabled: up to 500 accounts before production). Key set in `.env.local` and Cloudflare (Production + Preview). Verified on localhost: create church in Dropbox (answers survive the Dropbox redirect), invite code with the folder-specific steps, sign out, sign back in through the remembered church; no console errors. Test church left at `/Fidelia Test/Church.fidelia` in the author's Dropbox for a two-account test.

- 2026-11-15: **Dropbox is the default storage; Google is hidden** (`VITE_ENABLE_GOOGLE=1` brings back Drive storage, the picker and Gmail sending). Why: Google's picker fails in Safari/iPhone/Firefox, and it is the only way a second treasurer reaches a shared Drive file. Dropbox shared folders work in every browser. Dropbox sign-in now checks a remembered church is still at its path (otherwise lists files again), has "Look again" and "Know where the file is?" (type a path), explains accepting Dropbox's share invitation, and Members → Invite names the exact folder to share. Tests in dropbox.test.ts.

- 2026-11-15: **Google Picker fails in Safari / on iPhone / without Google cookies** ("The API developer key is invalid" after Google's cookie-consent page). Cause: the picker is a docs.google.com iframe, and those browsers block its cookies as third-party, so consent can't be saved. Not fixable on our side. Creating a church now always offers the typed folder name, with the picker as an optional extra. The "find a shared file" step explains to do it once on a computer in Chrome; `drive.file` access is per Google account, so the church then appears on every device. Also: live site went up at https://fidelia-browser.pages.dev; the picker page sends `Referrer-Policy: strict-origin` so the key's website restriction can match; new churches start with funds General, Building, Mercy, Mission.

- 2026-11-09: Fixed both open bugs. (1) The Members page names admins who have no password yet (e.g. imported from the old app), tells you to set one, and shows a "No password yet" badge. (2) The edit lock's editor name is now encrypted with the church data key (`sealString`/`openString`, `e1:` prefix, capped at 30 bytes to fit Drive appProperties), so only members can see who is editing. Older plain locks still display.

- 2026-11-09: Drive folder chooser now shows church files too (it used to show only folders, so a folder holding the church looked empty and a duplicate got created). Picking an existing church file there opens it for sign-in. Creating a church refuses a file name that already exists in that folder.

- 2026-11-09: **Closing the window releases the edit lock** when everything is saved. It uses a `keepalive` request (Drive appProperties / Dropbox `.lock`), so the next person doesn't wait 3 minutes. A read-only window now checks every 30 s and switches to editing on its own; the banner says so.

- 2026-11-09: **Invite codes** for new members. Members → Invite someone (pick a role) creates a one-time 16-character code, valid 14 days, kept as an `invite` key slot. The role and expiry are bound into the slot's AAD, so editing the header breaks it. The new person signs in, chooses "I have an invite code", then picks their own full name, sign-in name and password. The invite slot is removed when used. Admins see pending invites and can revoke them. Setting a password for someone yourself is still available. Tests in envelope.test.ts and church.test.ts.

- 2026-11-09: **Choose in Google Drive** (Google Picker), on a separate page `/drive-picker.html` so Google's script never runs next to church data. Create account → Drive → "Choose a folder in Google Drive". Sign in → Drive → "Find it in Google Drive" opens a church file someone shared with you (picking grants `drive.file` access). Needs `VITE_GOOGLE_API_KEY` (project number comes from the client ID); without them the typed folder name is used. Not yet tried with a real key.

- 2026-11-09: Welcome page redone as **Sign in** / **Create a church account** (demo is a small link). Sign in goes straight to the church this browser used last time ("Different church" and "Forget" links), otherwise asks where the data lives (Drive/Dropbox/this computer) and opens the file directly if only one is found. Create account is 3 steps: church and person, then where to keep the data (Drive folder choice, Dropbox path, or local file), then the password. Answers that aren't secret survive the Google/Dropbox sign-in redirect via sessionStorage; the password is never stored.

- 2026-11-06: Drive setup now asks where to save: a folder (default “Fidelia”, reused if the app made it before, otherwise created) or the top of My Drive, plus the file name.

- 2026-11-06: Fixed: “Continue: Google Drive” stayed after the file was deleted in Drive. Continue now checks the file exists (not trashed/404) and forgets it if not, with a message. Every Continue shortcut has a “Forget” link.

- 2026-11-06: Fixed: backing out of “Set up a new church in Drive” left empty `Church.fidelia` files. The Drive file is now created only on **Create church** (and trashed if setup fails); empty leftovers are hidden from the Drive list.

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
- ~~Google OAuth client ID~~ and ~~Picker API key~~: done by the author; Drive and the picker work locally.

## Bugs

- None open.

## Under discussion (not scheduled; author will decide)

- **Sign in with Google** instead of a Fidelia password: a random key kept in the member's hidden Drive app-data folder unlocks their slot. Never derive a key from the email address. Drawbacks discussed: the Google account becomes the only lock, shared office PCs stay signed in, Google holds both file and key, shared church accounts blur the audit log, Drive only. Suggested middle ground: optional “Google + PIN” per member, with passwords kept as the default.
- **File ownership:** recommend creating the church from a church-owned Google account.
- **“Move church to…”** (author's Save As idea): move to another Drive account/folder, Dropbox or local file, and mark the old file retired (read-only, “moved to …”) so two live copies can't drift apart.
- ~~Several people managing one Drive church~~: solved by “Find it in Google Drive” (picker) plus invite codes.

## Next

1. **Author to test:** create a church in a Dropbox folder, share that folder with a second Dropbox account, then join with an invite code from Safari/iPhone.
1. **Author to test:** the full invite flow with two Google accounts (create invite → sign out → join with the code), and the folder chooser showing church files.
2. **Author's Drive clean-up:** `Fidelia/` has two `church.fidelia`; the newer one (created 23:06 UTC, 4.7 KB) is the accidental duplicate.
3. Visual check of the phone layout on a real iPhone (the automated browser could not resize its viewport).
4. After the first deploy: check that `/drive-picker.html` gets its own looser CSP and app pages keep the strict one (Cloudflare `_headers` detach syntax is unverified).
5. End-to-end checks with real Microsoft/Dropbox accounts once their IDs exist (blocked, see above).
