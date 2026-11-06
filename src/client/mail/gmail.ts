// Send mail as the signed-in Gmail / Google Workspace user (gmail.send scope), in a popup.
import type { Mailer, OutgoingMail } from './types';
import { callbackUrl, oauthPopup } from './oauthPopup';
import { googleClientId } from '../storage/googleAuth';

const SCOPES = 'https://www.googleapis.com/auth/gmail.send email';

/** UTF-8 → base64, chunked so large messages don't overflow the call stack. */
export function b64utf8(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
const wrap76 = (s: string) => s.replace(/.{1,76}/g, '$&\r\n').trimEnd();
/** RFC 2047 encoded-word for non-ASCII headers. */
const header = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64utf8(s)}?=`);

/** Builds a multipart MIME message (text body + attachments). */
export function buildMime(mail: OutgoingMail, from: string | null, boundary = `fidelia-${crypto.randomUUID()}`): string {
  const lines = [
    ...(from ? [`From: ${from}`] : []),
    `To: ${mail.to.join(', ')}`,
    `Subject: ${header(mail.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(b64utf8(mail.bodyText)),
  ];
  for (const a of mail.attachments) {
    const name = a.filename.replace(/"/g, '');
    lines.push(`--${boundary}`, `Content-Type: ${a.contentType}; name="${name}"`, `Content-Disposition: attachment; filename="${name}"`,
      'Content-Transfer-Encoding: base64', '', wrap76(a.contentBase64));
  }
  lines.push(`--${boundary}--`, '');
  return lines.join('\r\n');
}

export class GmailMailer implements Mailer {
  readonly provider = 'gmail' as const;
  private constructor(private token: string, private expiresAt: number, private address: string | null) {}
  sender() { return this.address; }

  static async signIn(): Promise<GmailMailer> {
    if (!googleClientId()) throw new Error('Gmail sending is not configured for this site (missing VITE_GOOGLE_CLIENT_ID)');
    const state = crypto.randomUUID();
    const url = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
      client_id: googleClientId()!, redirect_uri: callbackUrl(), response_type: 'token', scope: SCOPES, state, prompt: 'select_account',
    })}`;
    const p = await oauthPopup(url, state);
    const token = p.get('access_token')!;
    let address: string | null = null;
    try {
      const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${token}` } });
      address = (await r.json()).email ?? null;
    } catch { /* optional */ }
    return new GmailMailer(token, Date.now() + Number(p.get('expires_in') ?? 3600) * 1000, address);
  }

  async send(mail: OutgoingMail): Promise<'sent'> {
    if (this.expiresAt - 60_000 < Date.now()) throw new Error('Gmail sign-in expired. Sign in again.');
    const raw = b64utf8(buildMime(mail, this.address)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      throw new Error(`Gmail: ${j?.error?.message ?? res.statusText}`);
    }
    return 'sent';
  }
}
