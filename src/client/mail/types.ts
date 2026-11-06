// Mail is sent from the browser through the treasurer's own account
// (Microsoft 365 via Graph, or Gmail). Message content never touches our servers.
export interface MailAttachment {
  filename: string;
  contentType: string;
  contentBase64: string;
}

export interface OutgoingMail {
  to: string[];
  subject: string;
  bodyText: string;
  attachments: MailAttachment[];
}

export interface Mailer {
  readonly provider: 'microsoft' | 'gmail' | 'dry-run';
  /** The signed-in sender address, if known. */
  sender(): string | null;
  send(mail: OutgoingMail): Promise<'sent' | 'dry_run'>;
}

let active: Mailer | null = null;
export const setMailer = (m: Mailer | null) => { active = m; };
export const getMailer = () => active;
