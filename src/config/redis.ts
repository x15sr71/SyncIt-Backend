import { Redis } from 'ioredis';
import * as dotenv from 'dotenv';
dotenv.config();

const MAX_RECONNECT_ATTEMPTS = 10;

const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
  // Exponential backoff: wait 2^attempt * 100ms, capped at 30s
  retryStrategy(attempt) {
    if (attempt > MAX_RECONNECT_ATTEMPTS) {
      console.error(`[Redis] Giving up after ${MAX_RECONNECT_ATTEMPTS} reconnect attempts`);
      return null; // stop retrying
    }
    const delay = Math.min(100 * Math.pow(2, attempt), 30_000);
    console.warn(`[Redis] Reconnecting in ${delay}ms (attempt ${attempt})`);
    return delay;
  },
  // Don't throw on connect — let callers handle errors
  lazyConnect: false,
  enableOfflineQueue: true,
  maxRetriesPerRequest: 2,
});

redis.on('connect', () => console.log('[Redis] Connected'));
redis.on('error', (err) => console.error('[Redis] Error:', err.message));
redis.on('close', () => console.warn('[Redis] Connection closed'));

export default redis;
