# Fidelia (browser edition)

Church bookkeeping and donor management that runs entirely in the browser.

- **No install.** Open the website, sign in, work.
- **The church keeps its data.** The database lives, encrypted, in the church's own Google Drive or Dropbox.
- **Zero-knowledge.** Data is decrypted only in the user's browser. The site's host never sees the data or the keys.

> Status: working beta. Everything runs in the browser (no backend). Storage: local file (Chrome/Edge) and Google Drive. See [docs/progress.md](docs/progress.md).

## How it works

1. A user signs in. Their password derives a key (PBKDF2) that unwraps the church's **data key**. A printed recovery key can unwrap it too.
2. The browser downloads the encrypted database from the church's cloud storage and decrypts it.
3. The database runs in memory as SQLite (WebAssembly), queried with Drizzle ORM.
4. Every change is saved automatically: encrypted in the browser, then uploaded back.
5. A lock ensures only one person edits at a time. Others get a read-only view.
6. Donor statements are emailed straight from the browser through the treasurer's own Microsoft 365 or Gmail account.

Guides: [treasurer guide](docs/treasurer-guide.md) · [deployment](docs/deploy.md) · [design decisions](docs/decisions.md)

## Development

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build to dist/
npm test           # vitest
npm run db:generate  # generate a migration after editing src/db/schema.ts
```

## Project layout

```
src/
  client/
    lib/api.ts   the seam pages call; routes to the local data layer
    data/        ported business logic on in-browser SQLite (sql.js + Drizzle), with tests
    crypto/      envelope encryption and the church file format
    church/      session: unlock, members, autosave, edit lock, diagnostics
    storage/     adapters: memory, local file, Google Drive (+ OAuth)
    mail/        Microsoft Graph and Gmail senders (popup OAuth)
    pages/, components/
  shared/   types and shared helpers
  db/       Drizzle schema and SQL migrations (applied in the browser)
scripts/    export-old-db.mjs (migrate from the old app), vendor-ocr.mjs
public/     _headers (CSP), _redirects, oauth-callback page
```
