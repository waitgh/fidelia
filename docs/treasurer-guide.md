# Treasurer's guide

Fidelia keeps your church's offering records. It runs in your web browser, with nothing to install. Your data is locked (encrypted) in the browser before it is saved, so only people with a church password can read it. The people who run the website cannot.

## Setting up (one time)

1. Open the website and choose **Google Drive** (recommended; works on iPhone) or **Set up a new church** to keep the file on this computer.
2. Enter the church name, your name, a username and a password.
3. **Print the recovery key** and keep it somewhere safe, like the church office safe. If every admin forgets their password, this key is the only way back in. There is no “forgot password” email.
4. Go to **Members** and add a second admin. Each person gets their own username and password.
5. With Google Drive, share the church file (in Drive) with the people you added. They open it from Drive with **Open with → Fidelia Ledger**.

## Everyday use

- Changes save automatically. The bottom-left corner shows *Saved* or *Saving…*.
- Only one person can edit at a time. If someone else is editing, you'll see who, and you can still look at everything.
- You'll be signed out after 15 minutes without activity.

## Roles

- **Admin**: everything, including members and the recovery key.
- **Bookkeeper**: offerings, donors, pledges, reports.
- **Viewer**: look only.

## Backups and mistakes

- **Data & Backup → Previous versions** lets an admin go back to an earlier save.
- **Download encrypted backup** saves a copy you can keep elsewhere. It opens with the same passwords.

## Year-end statements

Use a laptop. In Reports, choose donor statements, then **Email statements**. Sign in with the church's Microsoft 365 or Gmail account. Emails go directly from your browser to Microsoft or Google. If sending stops partway, open it again and it continues with the donors not yet sent.

## Getting help

**Data & Backup → Copy diagnostics** copies a short report (counts and version numbers only, no names or amounts) that you can email to whoever helps you.

## Moving from the old Fidelia Ledger app

Your helper runs `scripts/export-old-db.mjs` to make a plain copy of the old database. Then choose **Set up a new church**, open “Moving from the old Fidelia Ledger app?”, and pick that file. Everyone from the old app is listed under Members. An admin sets a new password for each person. Afterwards, delete the plain copy.
