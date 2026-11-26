// Popup OAuth for mail sign-in while a church is open. (A full-page redirect would
// discard the decrypted session.) The popup returns to /oauth-callback.html, which sends
// the result back on a same-origin BroadcastChannel and, when it still can, to window.opener.
//
// We do not treat `popup.closed` as "cancelled": browsers cut the link to a popup that
// passes through the provider's pages (Cross-Origin-Opener-Policy), and then report it as
// closed while the user is still signing in. A later attempt replaces an unfinished one.
export const callbackUrl = () => `${location.origin}/oauth-callback.html`;

const CHANNEL = 'fidelia-oauth';
const TIMEOUT_MS = 10 * 60_000;

interface OAuthMessage { type?: string; search?: string; hash?: string }

/** Turns a callback message into the provider's parameters, or null if it isn't ours. */
export function readOAuthMessage(data: OAuthMessage | null | undefined, state: string): URLSearchParams | null {
  if (!data || data.type !== 'fidelia-oauth') return null;
  const raw = data.hash ? String(data.hash).slice(1) : String(data.search ?? '').slice(1);
  const params = new URLSearchParams(raw);
  return params.get('state') === state ? params : null;
}

/** Thrown to an unfinished attempt when the user starts a new one; callers can ignore it. */
export class SignInRestartedError extends Error {
  constructor() { super('Sign-in was restarted'); this.name = 'SignInRestartedError'; }
}

let cancelPrevious: (() => void) | null = null;

export interface PopupDeps {
  open: (url: string) => unknown | null;
  channel: () => { onmessage: ((e: { data: unknown }) => void) | null; close(): void } | null;
  addMessageListener: (fn: (e: MessageEvent) => void) => () => void;
  origin: string;
  timeoutMs?: number;
}

const browserDeps = (): PopupDeps => ({
  open: (url) => window.open(url, 'fidelia-oauth', 'width=520,height=680'),
  channel: () => {
    if (!('BroadcastChannel' in window)) return null;
    const bc = new BroadcastChannel(CHANNEL);
    const wrapped = {
      onmessage: null as ((e: { data: unknown }) => void) | null,
      close: () => bc.close(),
    };
    bc.onmessage = (e) => wrapped.onmessage?.({ data: e.data });
    return wrapped;
  },
  addMessageListener: (fn) => { window.addEventListener('message', fn); return () => window.removeEventListener('message', fn); },
  origin: location.origin,
});

export function oauthPopup(authUrl: string, state: string, deps: PopupDeps = browserDeps()): Promise<URLSearchParams> {
  cancelPrevious?.();
  return new Promise((resolve, reject) => {
    if (!deps.open(authUrl)) return reject(new Error('The sign-in window was blocked. Allow pop-ups for this site and try again.'));
    const ch = deps.channel();
    let finished = false;
    const finish = (fn: () => void) => {
      if (finished) return;
      finished = true;
      if (ch) { ch.onmessage = null; ch.close(); }
      removeListener();
      clearTimeout(timer);
      if (cancelPrevious === cancel) cancelPrevious = null;
      fn();
    };
    const handle = (data: unknown) => {
      const params = readOAuthMessage(data as OAuthMessage, state);
      if (!params) return;
      finish(() => (params.get('error') ? reject(new Error(params.get('error_description') ?? params.get('error')!)) : resolve(params)));
    };
    if (ch) ch.onmessage = (e) => handle(e.data);
    const removeListener = deps.addMessageListener((e) => { if (e.origin === deps.origin) handle(e.data); });
    const timer = setTimeout(() => finish(() => reject(new Error('Sign-in did not finish. Please try again.'))), deps.timeoutMs ?? TIMEOUT_MS);
    // A newer attempt replaces this one quietly (the user clicked sign-in again).
    const cancel = () => finish(() => reject(new SignInRestartedError()));
    cancelPrevious = cancel;
  });
}

export function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function pkcePair() {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  return { verifier, challenge };
}
