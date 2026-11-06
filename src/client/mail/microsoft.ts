// Send mail as the signed-in Microsoft 365 user via Graph (/me/sendMail).
// OAuth: authorization code + PKCE (SPA platform, no client secret), in a popup.
import type { Mailer, OutgoingMail } from './types';
import { callbackUrl, oauthPopup, pkcePair } from './oauthPopup';

const AUTHORITY = 'https://login.microsoftonline.com/common/oauth2/v2.0';
const SCOPES = 'openid profile email offline_access https://graph.microsoft.com/Mail.Send';
export const msClientId = (): string | undefined => import.meta.env.VITE_MS_CLIENT_ID || undefined;

interface Tokens { access: string; refresh?: string; expiresAt: number }

export function graphMessage(mail: OutgoingMail) {
  return {
    message: {
      subject: mail.subject,
      body: { contentType: 'Text', content: mail.bodyText },
      toRecipients: mail.to.map((address) => ({ emailAddress: { address } })),
      attachments: mail.attachments.map((a) => ({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: a.filename,
        contentType: a.contentType,
        contentBytes: a.contentBase64,
      })),
    },
    saveToSentItems: true,
  };
}

export class MicrosoftMailer implements Mailer {
  readonly provider = 'microsoft' as const;
  private constructor(private tokens: Tokens, private address: string | null) {}

  sender() { return this.address; }

  private static async token(body: Record<string, string>): Promise<Tokens & { idToken?: string }> {
    const res = await fetch(`${AUTHORITY}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: msClientId()!, scope: SCOPES, ...body }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error_description ?? 'Microsoft sign-in failed');
    return { access: j.access_token, refresh: j.refresh_token, expiresAt: Date.now() + j.expires_in * 1000, idToken: j.id_token };
  }

  static async signIn(): Promise<MicrosoftMailer> {
    if (!msClientId()) throw new Error('Microsoft 365 sending is not configured for this site (missing VITE_MS_CLIENT_ID)');
    const { verifier, challenge } = await pkcePair();
    const state = crypto.randomUUID();
    const url = `${AUTHORITY}/authorize?${new URLSearchParams({
      client_id: msClientId()!, response_type: 'code', redirect_uri: callbackUrl(), response_mode: 'query',
      scope: SCOPES, state, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account',
    })}`;
    const params = await oauthPopup(url, state);
    const t = await MicrosoftMailer.token({ grant_type: 'authorization_code', code: params.get('code')!, redirect_uri: callbackUrl(), code_verifier: verifier });
    let address: string | null = null;
    try {
      const claims = JSON.parse(atob(t.idToken!.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/')));
      address = claims.email ?? claims.preferred_username ?? null;
    } catch { /* optional */ }
    return new MicrosoftMailer(t, address);
  }

  private async accessToken() {
    if (this.tokens.expiresAt - 60_000 > Date.now()) return this.tokens.access;
    if (!this.tokens.refresh) throw new Error('Microsoft sign-in expired. Sign in again.');
    this.tokens = await MicrosoftMailer.token({ grant_type: 'refresh_token', refresh_token: this.tokens.refresh });
    return this.tokens.access;
  }

  async send(mail: OutgoingMail): Promise<'sent'> {
    const res = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
      method: 'POST',
      headers: { Authorization: `Bearer ${await this.accessToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(graphMessage(mail)),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      throw new Error(`Microsoft 365: ${j?.error?.message ?? res.statusText}`);
    }
    return 'sent';
  }
}
