import { describe, expect, test } from 'vitest';
import { MAX_THROTTLE_RETRIES, SEND_GAP_MS, ThrottledError, isThrottleStatus, retryAfterMs, sendPolitely } from './pacing';

describe('pacing limits', () => {
  test('stays under Microsoft 365\'s 30 messages per minute', () => {
    expect(60_000 / SEND_GAP_MS).toBeLessThan(30);
  });
});

describe('retryAfterMs', () => {
  test('reads seconds', () => {
    expect(retryAfterMs('20')).toBe(20_000);
  });
  test('reads an HTTP date', () => {
    const now = Date.parse('2026-12-01T10:00:00Z');
    expect(retryAfterMs('Tue, 01 Dec 2026 10:00:30 GMT', now)).toBe(30_000);
  });
  test('defaults to a minute when missing or unreadable', () => {
    expect(retryAfterMs(null)).toBe(60_000);
    expect(retryAfterMs('soon')).toBe(60_000);
  });
  test('never waits less than 5 seconds or more than 10 minutes', () => {
    expect(retryAfterMs('0')).toBe(5_000);
    expect(retryAfterMs('86400')).toBe(600_000);
  });
});

describe('isThrottleStatus', () => {
  test('429 and 503 mean slow down; other errors do not', () => {
    expect(isThrottleStatus(429)).toBe(true);
    expect(isThrottleStatus(503)).toBe(true);
    expect(isThrottleStatus(400)).toBe(false);
    expect(isThrottleStatus(401)).toBe(false);
    expect(isThrottleStatus(500)).toBe(false);
  });
});

describe('sendPolitely', () => {
  const noSleep = { sleep: async () => {} };

  test('waits as long as asked and retries the same message', async () => {
    const waits: number[] = [];
    let calls = 0;
    const result = await sendPolitely(async () => {
      calls++;
      if (calls < 3) throw new ThrottledError(7000, 'Microsoft 365');
      return 'sent';
    }, { sleep: async (ms) => { waits.push(ms); }, onWait: () => {} });
    expect(result).toBe('sent');
    expect(calls).toBe(3);
    expect(waits).toEqual([7000, 7000]);
  });

  test('gives up after a few throttled tries', async () => {
    let calls = 0;
    await expect(sendPolitely(async () => { calls++; throw new ThrottledError(5000, 'Gmail'); }, noSleep)).rejects.toBeInstanceOf(ThrottledError);
    expect(calls).toBe(MAX_THROTTLE_RETRIES + 1);
  });

  test('does not retry real errors', async () => {
    let calls = 0;
    await expect(sendPolitely(async () => { calls++; throw new Error('Invalid recipient'); }, noSleep)).rejects.toThrow('Invalid recipient');
    expect(calls).toBe(1);
  });

  test('stops waiting when the user presses Stop', async () => {
    let stop = false;
    let calls = 0;
    await expect(sendPolitely(async () => { calls++; throw new ThrottledError(5000, 'Microsoft 365'); }, {
      sleep: async () => { stop = true; },
      shouldStop: () => stop,
    })).rejects.toBeInstanceOf(ThrottledError);
    expect(calls).toBe(1);
  });
});
