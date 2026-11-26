// How bulk statement sending stays polite to Microsoft 365 / Gmail.
// - One message at a time, at least SEND_GAP_MS apart (Microsoft allows 30 per minute per mailbox).
// - When the provider says "too many requests" (429, or 503 with Retry-After), wait as long as it
//   asks and retry the same donor, a few times at most.
// - After several real failures in a row, stop the run instead of hammering a broken mailbox.

export const SEND_GAP_MS = 3000; // 20 per minute
export const MAX_THROTTLE_RETRIES = 3;
export const STOP_AFTER_FAILURES_IN_A_ROW = 5;
const DEFAULT_WAIT_MS = 60_000;
const MIN_WAIT_MS = 5_000;
const MAX_WAIT_MS = 10 * 60_000;

/** The provider asked us to slow down. */
export class ThrottledError extends Error {
  constructor(readonly waitMs: number, provider: string) {
    super(`${provider} asked Fidelia to slow down`);
    this.name = 'ThrottledError';
  }
}

/** Reads a Retry-After header (seconds or an HTTP date) into a sensible wait. */
export function retryAfterMs(header: string | null, now = Date.now()): number {
  let ms = DEFAULT_WAIT_MS;
  if (header) {
    const secs = Number(header);
    if (Number.isFinite(secs)) ms = secs * 1000;
    else {
      const at = Date.parse(header);
      if (Number.isFinite(at)) ms = at - now;
    }
  }
  return Math.min(MAX_WAIT_MS, Math.max(MIN_WAIT_MS, ms));
}

/** True for the responses that mean "slow down" rather than "this message is bad". */
export const isThrottleStatus = (status: number) => status === 429 || status === 503;

/**
 * Sends one message, waiting and retrying when the provider throttles us.
 * `onWait` lets the screen say what is happening.
 */
export async function sendPolitely<T>(
  send: () => Promise<T>,
  opts: { sleep: (ms: number) => Promise<void>; onWait?: (ms: number) => void; shouldStop?: () => boolean },
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await send();
    } catch (e) {
      if (!(e instanceof ThrottledError) || attempt >= MAX_THROTTLE_RETRIES || opts.shouldStop?.()) throw e;
      opts.onWait?.(e.waitMs);
      await opts.sleep(e.waitMs);
      if (opts.shouldStop?.()) throw e;
    }
  }
}
