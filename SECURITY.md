# Security

Fidelia keeps church records encrypted, and they are only decrypted in the user's browser. Security problems matter a lot here, so thank you for looking.

## Reporting a problem

Please **don't open a public issue** for security problems. Report them privately instead:

1. Go to the repository's **Security** tab.
2. Click **Report a vulnerability**.

Say what you found, how to reproduce it, and what an attacker could do with it. You'll get a reply as soon as possible. This is a volunteer project, so it may take a few days.

## What counts

Anything that could let someone who isn't a church member read or change church data, or let a member do more than their role allows. For example:

- weaknesses in the encryption, key wrapping, or recovery key
- church data, keys or passwords leaving the browser (including in logs, error reports or diagnostics)
- ways around the edit lock, invite codes or roles that damage data
- script injection (XSS) or anything that loosens the Content-Security-Policy
- a malicious church file or CSV import that runs code or corrupts other data

## Out of scope

- Someone who already knows a member's password, or has the printed recovery key
- A compromised device or browser extension on the user's own computer
- Problems in Dropbox, Google or Microsoft themselves (report those to them)

## Supported versions

Only the version running at https://fidelia.pages.dev, which is built from the `main` branch.
