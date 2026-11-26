import { describe, expect, test } from 'vitest';
import { oauthPopup, readOAuthMessage, SignInRestartedError, type PopupDeps } from './oauthPopup';

function fakeDeps(over: Partial<PopupDeps> = {}) {
  const channel = { onmessage: null as ((e: { data: unknown }) => void) | null, closed: false, close() { this.closed = true; } };
  let listener: ((e: MessageEvent) => void) | null = null;
  const deps: PopupDeps = {
    open: () => ({}),
    channel: () => channel,
    addMessageListener: (fn) => { listener = fn; return () => { listener = null; }; },
    origin: 'https://app.test',
    ...over,
  };
  return {
    deps,
    channel,
    viaChannel: (data: unknown) => channel.onmessage?.({ data }),
    viaOpener: (data: unknown, origin = 'https://app.test') => listener?.({ data, origin } as MessageEvent),
    hasListener: () => listener !== null,
  };
}

const msg = (q: string) => ({ type: 'fidelia-oauth', search: `?${q}`, hash: '' });

describe('readOAuthMessage', () => {
  test('accepts our message with the right state, from the query or the hash', () => {
    expect(readOAuthMessage(msg('code=c1&state=s1'), 's1')?.get('code')).toBe('c1');
    expect(readOAuthMessage({ type: 'fidelia-oauth', search: '', hash: '#access_token=t&state=s1' }, 's1')?.get('access_token')).toBe('t');
  });
  test('ignores other messages and other states', () => {
    expect(readOAuthMessage(msg('code=c1&state=other'), 's1')).toBeNull();
    expect(readOAuthMessage({ type: 'something-else', search: '?state=s1' }, 's1')).toBeNull();
    expect(readOAuthMessage(null, 's1')).toBeNull();
  });
});

describe('oauthPopup', () => {
  test('finishes from the BroadcastChannel even when the opener link is gone', async () => {
    const f = fakeDeps();
    const p = oauthPopup('https://login.test', 's1', f.deps);
    f.viaChannel(msg('code=abc&state=s1'));
    expect((await p).get('code')).toBe('abc');
    expect(f.channel.closed).toBe(true);
    expect(f.hasListener()).toBe(false);
  });

  test('still finishes through window.opener, but only from our own origin', async () => {
    const f = fakeDeps();
    const p = oauthPopup('https://login.test', 's1', f.deps);
    f.viaOpener(msg('code=evil&state=s1'), 'https://evil.test');
    f.viaOpener(msg('code=good&state=s1'));
    expect((await p).get('code')).toBe('good');
  });

  test('ignores a result meant for a different attempt', async () => {
    const f = fakeDeps({ timeoutMs: 50 });
    const p = oauthPopup('https://login.test', 's1', f.deps);
    f.viaChannel(msg('code=x&state=s2'));
    await expect(p).rejects.toThrow('did not finish');
  });

  test('reports the provider error', async () => {
    const f = fakeDeps();
    const p = oauthPopup('https://login.test', 's1', f.deps);
    f.viaChannel(msg('error=access_denied&error_description=Need%20admin%20approval&state=s1'));
    await expect(p).rejects.toThrow('Need admin approval');
  });

  test('a blocked popup fails straight away', async () => {
    const f = fakeDeps({ open: () => null });
    await expect(oauthPopup('https://login.test', 's1', f.deps)).rejects.toThrow('blocked');
  });

  test('a new attempt replaces an unfinished one', async () => {
    const a = fakeDeps();
    const first = oauthPopup('https://login.test', 's1', a.deps);
    const b = fakeDeps();
    const second = oauthPopup('https://login.test', 's2', b.deps);
    await expect(first).rejects.toBeInstanceOf(SignInRestartedError);
    b.viaChannel(msg('code=two&state=s2'));
    expect((await second).get('code')).toBe('two');
  });
});
