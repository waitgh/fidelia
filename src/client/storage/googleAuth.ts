// Google OAuth via full-page redirect (implicit flow): no Google scripts on our pages,
// works on iPhone. Scope `drive.file` = only files this app created or the user picked.
// The access token is kept in sessionStorage (it is not church data) until it expires.
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const KEY = 'fidelia.google.token';

/**
 * Google (Drive storage, the Drive picker, Gmail sending) is off unless VITE_ENABLE_GOOGLE=1.
 * It is hidden for now: Google's file picker breaks in Safari/iPhone/Firefox, which a second
 * treasurer needs to reach a shared Drive file. Dropbox is the default instead.
 */
export const googleEnabled = () => import.meta.env.VITE_ENABLE_GOOGLE === '1';
export const googleClientId = (): string | undefined => (googleEnabled() && import.meta.env.VITE_GOOGLE_CLIENT_ID) || undefined;

interface Stored { token: string; expiresAt: number }

export function getGoogleToken(now = Date.now()): string | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as Stored | null;
    return s && s.expiresAt - 60_000 > now ? s.token : null;
  } catch {
    return null;
  }
}

export function clearGoogleToken() {
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}

/** Sends the browser to Google; comes back to `returnPath` with the token in the URL hash. */
export function startGoogleSignIn(returnPath = '/', loginHint?: string) {
  const clientId = googleClientId();
  if (!clientId) throw new Error('Google Drive is not configured for this site (missing VITE_GOOGLE_CLIENT_ID)');
  const state = crypto.randomUUID();
  sessionStorage.setItem('fidelia.google.state', JSON.stringify({ state, returnPath }));
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${location.origin}/`,
    response_type: 'token',
    scope: SCOPE,
    include_granted_scopes: 'true',
    state,
  });
  if (loginHint) p.set('login_hint', loginHint);
  location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${p}`);
}

/** Call once at startup. If the URL hash holds a Google token, stores it, cleans the URL and returns the return path. */
export function completeGoogleSignIn(): string | null {
  if (!location.hash.includes('access_token=') && !location.hash.includes('error=')) return null;
  const h = new URLSearchParams(location.hash.slice(1));
  let saved: { state: string; returnPath: string } | null = null;
  try { saved = JSON.parse(sessionStorage.getItem('fidelia.google.state') ?? 'null'); } catch { /* ignore */ }
  sessionStorage.removeItem('fidelia.google.state');
  history.replaceState(null, '', location.pathname + location.search);
  if (!saved || h.get('state') !== saved.state) return null;
  const token = h.get('access_token');
  if (!token) throw new Error(`Google sign-in failed: ${h.get('error') ?? 'unknown error'}`);
  const stored: Stored = { token, expiresAt: Date.now() + Number(h.get('expires_in') ?? 3600) * 1000 };
  sessionStorage.setItem(KEY, JSON.stringify(stored));
  return saved.returnPath;
}
