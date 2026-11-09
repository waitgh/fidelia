// Google Picker page. See src/client/storage/drivePicker.ts for why this is a separate page.
import { getGoogleToken, startGoogleSignIn } from '../client/storage/googleAuth';
import { finishPick, pickerAppId, type PickMode } from '../client/storage/drivePicker';
import { FILE_MIME } from '../client/storage/googleDrive';

declare const gapi: any;
declare const google: any;

const mode: PickMode = new URLSearchParams(location.search).get('mode') === 'file' ? 'file' : 'folder';
const msg = document.getElementById('msg')!;

function fail(error: string) {
  msg.textContent = error;
  finishPick({ mode, error });
}

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load Google Drive. Check your connection and try again.'));
    document.head.appendChild(s);
  });
}

async function main() {
  const token = getGoogleToken();
  if (!token) { startGoogleSignIn(`/drive-picker.html?mode=${mode}`); return; }
  await loadScript('https://apis.google.com/js/api.js');
  await new Promise<void>((resolve) => gapi.load('picker', resolve));
  const P = google.picker;

  const builder = new P.PickerBuilder()
    .setOAuthToken(token)
    .setDeveloperKey(import.meta.env.VITE_GOOGLE_API_KEY)
    .setAppId(pickerAppId())
    .setOrigin(location.origin)
    .enableFeature(P.Feature.SUPPORT_DRIVES)
    .setCallback((data: any) => {
      if (data.action === P.Action.PICKED) {
        const d = data.docs?.[0];
        finishPick({ mode, id: d?.id, name: d?.name });
      } else if (data.action === P.Action.CANCEL) {
        finishPick({ mode, cancelled: true });
      }
    });

  if (mode === 'folder') {
    builder.setTitle('Choose a folder for your church’s data')
      .addView(new P.DocsView(P.ViewId.FOLDERS).setIncludeFolders(true).setSelectFolderEnabled(true).setMimeTypes('application/vnd.google-apps.folder').setParent('root'))
      .addView(new P.DocsView(P.ViewId.FOLDERS).setIncludeFolders(true).setSelectFolderEnabled(true).setMimeTypes('application/vnd.google-apps.folder').setEnableDrives(true));
  } else {
    builder.setTitle('Choose your church file (.fidelia)')
      .addView(new P.DocsView().setMimeTypes(FILE_MIME).setQuery('.fidelia').setIncludeFolders(true))
      .addView(new P.DocsView().setMimeTypes(FILE_MIME).setOwnedByMe(false))
      .addView(new P.DocsView().setMimeTypes(FILE_MIME).setEnableDrives(true).setIncludeFolders(true));
  }
  msg.textContent = '';
  builder.build().setVisible(true);
}

main().catch((e) => fail((e as Error).message));
