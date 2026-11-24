// "Stay in touch": an optional sign-up (a Google Form owned by the author) so churches can be told
// about important updates. A plain link: nothing about the church is sent or put in the URL.
import { useState } from 'react';
import { Mail, X } from 'lucide-react';

/** The sign-up form. Empty = every Stay in touch link is hidden. */
export const STAY_IN_TOUCH_URL = '';

const DISMISSED = 'fidelia.stayInTouchDismissed';

export function StayInTouchLink({ className = '', children = 'Stay in touch' }: { className?: string; children?: React.ReactNode }) {
  if (!STAY_IN_TOUCH_URL) return null;
  return <a href={STAY_IN_TOUCH_URL} target="_blank" rel="noopener noreferrer" className={className}>{children}</a>;
}

/** Dashboard card for admins, until they sign up or dismiss it (remembered in this browser only). */
export function StayInTouchCard() {
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem(DISMISSED) === '1'; } catch { return false; }
  });
  if (!STAY_IN_TOUCH_URL || hidden) return null;
  const dismiss = () => {
    try { localStorage.setItem(DISMISSED, '1'); } catch { /* private mode: hide for this visit only */ }
    setHidden(true);
  };
  return (
    <div className="card mb-6 flex items-start gap-4 p-4 sm:p-5">
      <div className="h-10 w-10 shrink-0 rounded-full bg-primary-50 flex items-center justify-center">
        <Mail className="h-5 w-5 text-primary-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900">Using Fidelia at your church? Let us know.</p>
        <p className="mt-1 text-sm text-gray-600">
          Leave a contact so we can tell you about important updates and fixes. It’s a short form, it’s optional,
          and none of your church’s records are shared.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a href={STAY_IN_TOUCH_URL} target="_blank" rel="noopener noreferrer" className="btn-primary btn-sm" onClick={dismiss}>
            Stay in touch
          </a>
          <button type="button" className="btn-secondary btn-sm" onClick={dismiss}>No thanks</button>
        </div>
      </div>
      <button type="button" className="p-1 text-gray-400 hover:text-gray-600" onClick={dismiss} title="Hide">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
