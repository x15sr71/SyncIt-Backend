/**
 * Shared helpers for calls to Spotify/YouTube (P2-3, P2-4):
 * - mapWithConcurrency bounds parallel fan-out (unbounded Promise.all over
 *   whole playlists guaranteed 429s that were then swallowed as "no results")
 * - withRetryAfter honors 429 + Retry-After with exponential fallback
 */

const MAX_RETRY_DELAY_MS = 60_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);
  return results;
}

export async function withRetryAfter<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      const status = error?.response?.status;
      if (status !== 429 || attempt >= maxRetries) throw error;

      const header = error.response?.headers?.['retry-after'];
      const parsed = Number(header);
      let delayMs =
        Number.isFinite(parsed) && parsed >= 0 ? parsed * 1000 : 1000 * Math.pow(2, attempt); // no header — exponential fallback
      delayMs = Math.min(delayMs, MAX_RETRY_DELAY_MS);

      console.warn(`[Upstream] 429 rate limited; retrying in ${delayMs}ms`);
      await sleep(delayMs);
    }
  }
}
