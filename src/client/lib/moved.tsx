// The site moved from fidelia-browser.pages.dev to fidelia.pages.dev; the old address is being retired.
import { kvKeys } from '../storage/recent';

export const OLD_HOST = 'fidelia-browser.pages.dev';
export const NEW_ORIGIN = 'https://fidelia.pages.dev';

/**
 * On the old address, go to the new one. Browser storage is per address, so a save that hasn't
 * reached Dropbox yet (kept under `pending:`) exists only here: stay, so signing in uploads it,
 * and return true to show a notice. Never forwards the query or hash (they may hold OAuth codes).
 */
export async function redirectIfOldAddress(host = location.hostname): Promise<boolean> {
  if (host !== OLD_HOST) return false;
  if ((await kvKeys('pending:')).length > 0) return true;
  location.replace(NEW_ORIGIN + '/');
  await new Promise(() => {}); // don't render while the browser leaves
  return false;
}

export function MovedNotice() {
  return (
    <div className="bg-amber-100 text-amber-900 text-sm px-4 py-2 text-center">
      Fidelia has moved to <a className="font-semibold underline" href={NEW_ORIGIN + '/'}>fidelia.pages.dev</a>. This
      browser has a change that hasn’t been saved to Dropbox yet: sign in here once so it saves, then use the new address.
    </div>
  );
}
