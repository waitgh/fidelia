import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './lib/auth.js';
import { App } from './App.js';
import './index.css';
import { setPendingStore } from './church/church';
import { getPendingSave, setPendingSave, kvGetAny, kvSetAny, kvKeys } from './storage/recent';
import { setResumeStores, SESSION_RECORD_KEY } from './church/resume';
import { completeGoogleSignIn } from './storage/googleAuth';
import { MovedNotice, redirectIfOldAddress } from './lib/moved';

setPendingStore({ get: getPendingSave, set: setPendingSave });
setResumeStores({
  getRecord: () => sessionStorage.getItem(SESSION_RECORD_KEY),
  setRecord: (v) => (v === null ? sessionStorage.removeItem(SESSION_RECORD_KEY) : sessionStorage.setItem(SESSION_RECORD_KEY, v)),
  getKey: (id) => kvGetAny(id),
  setKey: (id, e) => kvSetAny(id, e),
  keyIds: () => kvKeys('session-key:'),
});

// Returning from Google sign-in: store the token, then continue the Drive flow.
let googleError = '';
try {
  const returnPath = completeGoogleSignIn();
  // Signed in on the way to the Drive picker page: carry on there.
  if (returnPath?.startsWith('/drive-picker.html')) location.replace(returnPath);
  else if (returnPath !== null) sessionStorage.setItem('fidelia.resume', 'google-drive');
} catch (e) {
  googleError = (e as Error).message;
}
(window as any).__fideliaStartupError = googleError;

void redirectIfOldAddress().then((movedNotice) => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      {movedNotice && <MovedNotice />}
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </React.StrictMode>,
  );
});
