# Decisions and handoff notes

How this project came about, what was decided, and what's next. Written at the end of the design discussion (2026-11-06) so a new session can pick up the work.

## Who it's for

- The author is a volunteer who built Fidelia Ledger for their own church.
- Goal: offer it to **other local churches first**, with **non-technical** treasurers and bookkeepers as users.
- The author does **not** want to run a business or do heavy support. They also do **not** want custody of other churches' data, and ideally can't read it.
- the first church will be the first user of the new version and needs a migration path from the old app.

## How we got here

| Option considered | Outcome |
|---|---|
| Self-install for each church (Node, `.env`, rclone) | Rejected: not usable by non-technical people; support falls on the author |
| Desktop app (Electron) | Viable fallback: reuses the old code, but needs code signing, installers, and auto-update |
| Multi-tenant SaaS | Rejected: a real business with billing, ops, and data custody |
| Host one instance per church on a VPS | Rejected: the author would hold every church's data and keys and could read them |
| **Browser-only, zero-knowledge** | **Chosen**: no install, almost no ops, data stays in the church's own cloud, host can't read it |

Key reasoning: whoever runs code on decrypted data can see it. So the only way the host can't see church data is to decrypt **only in the browser**. The remaining trust point is the JavaScript we serve. Mitigate with 2FA on GitHub, hosting, and npm; lean dependencies; no third-party scripts; and possibly open-sourcing the code.

## Accepted trade-offs

- **One editor at a time per church** (a lock with heartbeat and expiry). Others get read-only. Concurrent editing may come later.
- **No "email me a reset link" recovery.** Another admin can re-grant access, or the church uses its printed recovery key. If both are lost, the data is gone. Require at least 2 admins per church.
- The developer **can't inspect data to debug**. Build scrubbed error reporting, a "Send diagnostics" export, and good seed data.
- Migrations run **in each church's browser**. There is no server-side hot fix, so tests and pre-save integrity checks are mandatory.
- Roles are enforced in the UI or at the storage layer (for example, a read-only Drive share for viewers), not by a server.
- iPhone should work well for lookups and light data entry. Heavy batch entry and year-end statements are for laptops.

## Repos

- **This repo** (`waitgh/fidelia-browser`, private on GitHub): the rewrite. Fresh history, started from a copy of the old frontend, shared types, and schema/migrations (up to `0010`).
- **Old repo**: the old server app (private). Express + SQLite + rclone. It is still the first church's production app, run under PM2 on port 3000. It is in **maintenance only** (bug fixes, no new features). Use it as the reference for business logic in `src/server/routes/`, `src/server/lib/statementTotals.ts`, and `src/server/lib/graphMail.ts`. Don't modify it from here.
- Remote uses HTTPS through the `gh` CLI login (account `waitgh`). Repo-local git author: <author>.

## Open decisions (ask the author)

- Public or private, and the license (MIT vs AGPL) if public.
- Default storage: church's Google Drive or Dropbox, our ciphertext-only storage, or both.
- In-browser SQLite: `sql.js` (Drizzle has a driver) vs the official SQLite WASM build.
- Lock and invite service: likely a Cloudflare Worker with Durable Objects; it stores no church data.
- Static hosting: likely Cloudflare Pages, with preview deploys per branch as staging.
- Encrypted file format, and how importing an old the first church database works. The old app encrypts at the SQLite level with SQLite3MultipleCiphers via `DB_ENCRYPTION_KEY`, plus an AES-256-GCM layer for cloud sync .

## Next steps (suggested order)

1. Add tests (Vitest is already configured) before porting logic.
2. Get Drizzle running on in-browser SQLite with `src/db/schema.ts`, applying `src/db/migrations` on open.
3. Add a storage-adapter interface with a **local-file adapter** for development.
4. Port behind `src/client/lib/api.ts` one area at a time: categories → donors → batches and offerings → pledges → reports and statements.
5. Then: envelope encryption and recovery kit, autosave with integrity check and previous versions, edit lock, invites, Google Drive and Dropbox adapters, sending email from the browser through the treasurer's own account, and importing an old database.

## Environment notes about the author

- Their Chrome won't open file-picker dialogs. When testing uploads in the browser, use drag-and-drop.
- They prefer not to be asked for confirmation before running commands.
- Dependency advisories resolved 2026-11-06 (removed unused `xlsx`, upgraded drizzle-orm 0.45 and react-router 7). `npm audit --omit=dev` is clean.
