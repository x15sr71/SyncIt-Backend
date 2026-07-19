import redis from '../../config/redis';

// Must comfortably exceed the longest plausible migration so a crashed
// process cannot deadlock a user; the TTL is the crash-release.
const LOCK_TTL_SECONDS = 900;

const lockKey = (userId: string) => `sync:running:${userId}`;

/**
 * Per-user sync mutex (Redis SET NX EX). Serializes migrations per user:
 * double-clicks, manual + scheduled overlap, concurrent directions.
 *
 * Fails open when Redis is down — a Redis outage must not halt syncing
 * (P1-4); production is expected to fail fast at bootstrap instead.
 */
export async function acquireUserSyncLock(userId: string): Promise<boolean> {
  try {
    const result = await redis.set(lockKey(userId), '1', 'EX', LOCK_TTL_SECONDS, 'NX');
    return result === 'OK';
  } catch (err: any) {
    console.warn('[SyncMutex] Redis unavailable, proceeding without lock:', err?.message);
    return true;
  }
}

export async function releaseUserSyncLock(userId: string): Promise<void> {
  try {
    await redis.del(lockKey(userId));
  } catch {
    // Lock will expire via TTL.
  }
}
