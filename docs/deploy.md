# Deploying Fidelia (browser edition)

The app is static files. There is no server to run and nothing that stores church data.

## 1. Build and host (Cloudflare Pages)

1. In Cloudflare Pages, connect the GitHub repo.
2. Build command `npm run build`, output directory `dist`, Node 20+.
3. `public/_headers` (strict Content-Security-Policy) and `public/_redirects` (SPA fallback) are deployed automatically.
4. Each branch gets a preview URL; use one as staging.
5. Turn on 2FA for GitHub, Cloudflare and npm. Whoever can change the deployed JavaScript can read church data, so these accounts are the real security boundary.

## 2. Google (Drive storage, optional Gmail sending)

1. Create a Google Cloud project. Enable the **Google Drive API** (and the **Gmail API** for Gmail sending).
2. OAuth consent screen: External. Scopes: `drive.file` (and `gmail.send` if used). `gmail.send` is a sensitive scope, so Google requires app verification before public use.
3. Credentials → OAuth client ID → **Web application**:
   - Authorized JavaScript origins: `https://<your-site>` and `http://localhost:5173`
   - Authorized redirect URIs: `https://<your-site>/`, `https://<your-site>/oauth-callback.html` (and the localhost equivalents)
4. Optional, so people can open a shared church file: Drive API → **Drive UI integration**, Open URL `https://<your-site>/`, default MIME type `application/octet-stream`, file extension `fidelia`.
5. Set `VITE_GOOGLE_CLIENT_ID` in Cloudflare Pages environment variables (and in `.env.local` for development).
6. Optional, recommended: **Choose in Google Drive** (Google Picker). Enable the **Google Picker API**. Under Credentials, create an **API key** and restrict it to HTTP referrers (`http://localhost:5173/*` and `https://<your-domain>/*`) and to the Google Picker API. Copy the **project number** from the project dashboard. Set `VITE_GOOGLE_API_KEY` and `VITE_GOOGLE_APP_ID` (the project number). Without them, people type a folder name instead and can't open church files shared with them.
   - The picker runs on its own page, `/drive-picker.html`, with its own CSP in `public/_headers`. That page loads Google's script and never holds church data. After deploying, check in the browser console that this page has the looser policy and that app pages still have the strict one.

## 3. Microsoft 365 sending (optional)

1. Entra admin center → App registrations → New. Supported accounts: any organization + personal.
2. Platform **Single-page application**, redirect URI `https://<your-site>/oauth-callback.html` (and localhost).
3. API permissions (delegated): `Mail.Send`, `offline_access`, `openid`, `profile`, `email`.
4. Set `VITE_MS_CLIENT_ID`.

These IDs are public identifiers, not secrets. They ship in the JavaScript bundle.

## 4. Before each release

- `npm test` and `npm run build` must pass. Changes to migrations, totals/reports or encryption need tests.
- A bad release can damage every church's file on its next save, and there is no server-side fix. Test with the demo and with a copy of a real church file on a preview deploy first.
- Schema changes: add a migration with `npm run db:generate`. Older app versions open newer files read-only and refuse to save.
