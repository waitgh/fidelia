import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './lib/auth.js';
import { App } from './App.js';
import './index.css';
import { setPendingStore } from './church/church';
import { getPendingSave, setPendingSave } from './storage/recent';
import { completeGoogleSignIn } from './storage/googleAuth';

setPendingStore({ get: getPendingSave, set: setPendingSave });

// Returning from Google sign-in: store the token, then continue the Drive flow.
let googleError = '';
try {
  if (completeGoogleSignIn() !== null) sessionStorage.setItem('fidelia.resume', 'google-drive');
} catch (e) {
  googleError = (e as Error).message;
}
(window as any).__fideliaStartupError = googleError;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
