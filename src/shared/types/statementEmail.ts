export type StatementEmailStatus = 'not_sent' | 'sent' | 'failed' | 'dry_run';

/** A donor who gave during a statement period, with their email-send state for that period. */
export interface StatementEmailRecipient {
  donorId: number;
  name: string;
  /** Raw email field from the donor record */
  email: string;
  /** Addresses from `email` that look valid; empty means the donor can't be emailed */
  validEmails: string[];
  /** Statement total (same exclusions as the letter) */
  total: number;
  status: StatementEmailStatus;
  sentAt: string | null;
  lastError: string | null;
}

export interface StatementEmailConfig {
  configured: boolean;
  dryRun: boolean;
  sender: string | null;
  missing: string[];
}

/** Subject/body template for statement emails. Supports {donorName}, {year}, {churchName}. */
export interface StatementEmailTemplate {
  subject: string;
  body: string;
}
