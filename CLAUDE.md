# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Collaboration rules

- Do not ask for confirmation before running commands. Just run them.

## Commands

```bash
npm run dev          # Vite dev server, port 5173 (there is no backend)
npm run build        # tsc type-check + vite build to dist/
npm test             # vitest (tests live next to code as *.test.ts)
npm run db:generate  # generate a migration after editing src/db/schema.ts
```

**Start here:** read [docs/decisions.md](docs/decisions.md) for why this project exists, the trade-offs already accepted, open decisions, and the next steps.

## What this project is

A browser-only rewrite of Fidelia Ledger (the Express + SQLite app in the old server app). Goals:

- Non-technical churches use it with **no install**, on desktop or iPhone.
- **The host never holds or can read church data.** All decryption happens in the browser.
- The encrypted database lives in the **church's own cloud storage** (Google Drive, Dropbox), or optionally as ciphertext on our storage.
- Hosting is static files (e.g. Cloudflare Pages), plus a tiny service for edit locks and invites that stores **no church data**.

The old server code is the reference for business logic. Port it from `the old server app's routes`; don't copy the Express/JWT/rclone architecture.

## Architecture (target)

- **`src/client/lib/api.ts` is the seam.** Pages call it. Keep its function signatures and replace the `fetch('/api/...')` bodies with local data-layer calls, so pages need few changes.
- **Data layer:** Drizzle ORM on in-browser SQLite (WASM), same schema as `src/db/schema.ts`. Ported route logic goes in `src/client/data/`.
- **Migrations** run in the browser when a database is opened. An outdated app version must refuse to save over a newer schema.
- **Encryption:** envelope encryption. A random per-church data key encrypts the database (AES-256-GCM via WebCrypto). The data key is wrapped once per user with a password-derived key, plus once with a printed recovery key. There is no server-side password reset.
- **Storage adapters:** a common interface with local-file (dev), Google Drive (`drive.file` scope), and Dropbox implementations.
- **Saving:** autosave after each change and on `visibilitychange`/`pagehide`. Run `PRAGMA integrity_check` before every upload, and keep previous versions so users can restore.
- **Locking:** one editor at a time, with a heartbeat and expiry. Others are read-only.
- **Email statements:** sent from the browser through the treasurer's own Microsoft 365 / Gmail account (delegated OAuth). Sending must be resumable.

## Rules that matter here

- **Never send decrypted data or keys to any server**, including logging and error reporting. Scrub PII from anything sent off-device.
- **No third-party scripts** (analytics, widgets, CDNs) on app pages. Keep npm dependencies lean, since they run next to decrypted data.
- **A bad release can corrupt every church's data on its next save, and we cannot fix it server-side.** Add tests for migrations, totals/reports, and encrypt/decrypt round-trips before shipping changes to them.
- Roles (admin/bookkeeper/viewer) can only be enforced in the UI or at the storage layer, not by a server.
- Mobile: use redirect OAuth flows (not pop-ups), provide tap-to-pick alongside drag-and-drop, and treat local browser storage as a cache only.

## Not yet ported (still server-era, to be replaced)

- `src/client/lib/api.ts`, `src/client/lib/auth.tsx`: still call the old `/api` backend
- `src/client/pages/Sync.tsx`, `src/client/components/SyncSetup.tsx`: rclone sync UI, to be replaced by storage adapters
- `src/client/pages/Login.tsx`, `src/client/pages/Users.tsx`: JWT login and user management, to be replaced by key unwrapping and invites
- `src/shared/config/app-config.ts`: congregation names and other church-specific options, to become per-church settings
