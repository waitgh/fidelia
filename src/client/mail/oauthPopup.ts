// Popup OAuth for mail sign-in while a church is open. (A full-page redirect would
// discard the decrypted session.) The popup returns to /oauth-callback.html, which
// posts the result back to this window.
export const callbackUrl = () => `${location.origin}/oauth-callback.html`;

export function oauthPopup(authUrl: string, state: string): Promise<URLSearchParams> {
  return new Promise((resolve, reject) => {
    const w = window.open(authUrl, 'fidelia-oauth', 'width=520,height=680');
    if (!w) return reject(new Error('The sign-in window was blocked. Allow pop-ups for this site and try again.'));
    const done = (fn: () => void) => { window.removeEventListener('message', onMsg); clearInterval(poll); fn(); };
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== location.origin || e.data?.type !== 'fidelia-oauth') return;
      const params = new URLSearchParams(e.data.hash ? String(e.data.hash).slice(1) : String(e.data.search).slice(1));
      if (params.get('state') !== state) return;
      done(() => (params.get('error') ? reject(new Error(params.get('error_description') ?? params.get('error')!)) : resolve(params)));
    };
    const poll = setInterval(() => { if (w.closed) done(() => reject(new Error('Sign-in was cancelled'))); }, 500);
    window.addEventListener('message', onMsg);
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
