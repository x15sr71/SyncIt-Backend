import redis from '../config/redis';

// Longer than any sane token-endpoint response; the TTL is the crash-release.
const LOCK_TTL_MS = 15_000;
const POLL_INTERVAL_MS = 300;

const lockKey = (provider: 'spotify' | 'youtube', userId: string) =>
  `refresh:${provider}:${userId}`;

/**
 * Per-user, per-provider refresh lock (Redis SET NX PX). Serializes
 * concurrent token refreshes so that, with provider-side refresh-token
 * rotation, a losing writer can't persist a stale refresh token (P1-5).
 *
 * Fails open when Redis is down — an outage must not block token refresh.
 */
export async function acquireRefreshLock(
  provider: 'spotify' | 'youtube',
  userId: string,
): Promise<boolean> {
  try {
    const result = await redis.set(lockKey(provider, userId), '1', 'PX', LOCK_TTL_MS, 'NX');
    return result === 'OK';
  } catch (err: any) {
    console.warn('[RefreshLock] Redis unavailable, proceeding without lock:', err?.message);
    return true;
  }
}

export async function releaseRefreshLock(
  provider: 'spotify' | 'youtube',
  userId: string,
): Promise<void> {
  try {
    await redis.del(lockKey(provider, userId));
  } catch {
    // Lock will expire via TTL.
  }
}

/** Wait until the holder finishes (lock key gone) or the timeout elapses. */
export async function waitForRefreshLock(
  provider: 'spotify' | 'youtube',
  userId: string,
  maxWaitMs = 6_000,
): Promise<void> {
  const key = lockKey(provider, userId);
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    try {
      if (!(await redis.get(key))) return;
    } catch {
      return; // Redis down — don't spin
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}
