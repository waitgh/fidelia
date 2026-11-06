# Fidelia (browser edition)

Church bookkeeping and donor management that runs entirely in the browser.

- **No install.** Open the website, sign in, work.
- **The church keeps its data.** The database lives, encrypted, in the church's own Google Drive or Dropbox.
- **Zero-knowledge.** Data is decrypted only in the user's browser. The site's host never sees the data or the keys.

> Status: early rewrite. The UI was carried over from the server-based Fidelia Ledger and still calls a `/api` backend that no longer exists. Pages are being ported to an in-browser database one area at a time.

## How it works

1. A user logs in. Their password derives a key that unwraps the church's **data key**.
2. The browser downloads the encrypted database from the church's cloud storage and decrypts it.
3. The database runs in memory as SQLite (WebAssembly), queried with Drizzle ORM.
4. Every change is saved automatically: encrypted in the browser, then uploaded back.
5. A lock ensures only one person edits at a time. Others get a read-only view.

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
  client/   React app (pages, components, lib)
  shared/   Types, config, and shared helpers
  db/       Drizzle schema and SQL migrations (applied in the browser)
```
