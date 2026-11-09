// The Google Picker (Google's own "choose in Drive" window) runs on a separate page,
// /drive-picker.html, because it needs Google's script and app pages load no third-party
// code. That page never sees church data: it only returns the picked file/folder id.
// Picking an item also grants this app (drive.file scope) access to it, which is how a
// second treasurer reaches a church file someone shared with them.
import { getGoogleToken, googleClientId, startGoogleSignIn } from './googleAuth';

export type PickMode = 'folder' | 'file';
export interface PickResult { mode: PickMode; id?: string; name?: string; isFolder?: boolean; cancelled?: boolean; error?: string }

const RESULT = 'fidelia.picked';

export const pickerConfigured = () => !!(import.meta.env.VITE_GOOGLE_API_KEY && googleClientId());

/**
 * The Picker's app ID must be the Cloud project *number*, or Google silently skips granting
 * access to the picked file. The OAuth client ID always starts with that number.
 */
export const pickerAppId = () => googleClientId()?.split('-')[0] ?? '';

/** Leaves the app for the picker page (signing in with Google first if needed). It comes back to "/". */
export function openDrivePicker(mode: PickMode) {
  const path = `/drive-picker.html?mode=${mode}`;
  if (getGoogleToken()) location.assign(path);
  else startGoogleSignIn(path);
}

/** Called by the picker page. */
export function finishPick(r: PickResult) {
  sessionStorage.setItem(RESULT, JSON.stringify(r));
  location.replace('/');
}

/** Reads (once) what the picker page returned. */
export function takePickResult(): PickResult | null {
  let r: PickResult | null = null;
  try { r = JSON.parse(sessionStorage.getItem(RESULT) ?? 'null'); } catch { /* ignore */ }
  sessionStorage.removeItem(RESULT);
  return r;
}
