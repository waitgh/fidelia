/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** Support IDs allowed to use Email Statements (comma-separated), or "*" for every church. */
  readonly VITE_EMAIL_CHURCHES?: string;
}
