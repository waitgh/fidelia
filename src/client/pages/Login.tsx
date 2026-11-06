/**
 * Login.tsx — updated for Fidelia Ledger brand refresh
 *
 * Changes from original:
 *  1. <BookOpen> icon replaced with <LogoMark> inside a styled badge
 *  2. "Fidelia Ledger" wordmark uses Playfair Display (serif) for "Fidelia",
 *     DM Sans light for "Ledger", gold accent
 *  3. Form card uses rounded-2xl, slightly more padding, refined input focus ring
 *  4. Sign In button uses primary-600 (consistent with btn-primary)
 *  5. Everything else (logic, error state, loading state) is UNCHANGED
 */

import { useState, type FormEvent } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '../lib/auth.js';
import { LogoMark } from '../components/Logo.js'; // ← NEW

export function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-primary-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* ── Logo lockup ── */}
        <div className="flex flex-col items-center mb-8 gap-3">
          {/* Icon badge */}
          <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center shadow-lg">
            <LogoMark size={40} />
          </div>
          {/* Wordmark */}
          <div className="text-center">
            <div className="flex items-baseline justify-center gap-2">
              <span
                className="text-2xl font-bold text-white tracking-tight"
                style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
              >
                Fidelia
              </span>
              <span
                className="text-xl font-light text-yellow-300 tracking-wide"
                style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}
              >
                Ledger
              </span>
            </div>
          </div>
        </div>

        {/* ── Sign-in card ── */}
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl shadow-xl p-7 space-y-5"
        >
          <h2
            className="text-xl font-semibold text-gray-900 text-center"
            style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
          >
            Sign In
          </h2>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 text-red-700 px-3 py-2 rounded-lg text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <div>
            <label htmlFor="username" className="label">
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="input"
              required
              autoFocus
              autoComplete="username"
            />
          </div>

          <div>
            <label htmlFor="password" className="label">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              required
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full py-2.5"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Signing in…
              </>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

      </div>
    </div>
  );
}
