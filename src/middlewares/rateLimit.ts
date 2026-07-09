import { Request, Response, NextFunction } from 'express';
import { RateLimiterRedis, RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible';
import redis from '../config/redis';

// Redis-backed so limits hold across restarts/instances; the in-memory
// insurance limiter keeps limiting (per process) through Redis outages.

// Global: 100 requests/min per IP (requires `trust proxy` for real IPs).
const globalLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'rl:global',
  points: 100,
  duration: 60,
  insuranceLimiter: new RateLimiterMemory({ points: 100, duration: 60 }),
});

// Strict: 10 migration/sync triggers per hour per user — these fan out into
// hundreds of quota-expensive provider calls (P1-3). High enough for a
// legitimate multi-select batch, low enough to stop quota-burning abuse.
const syncLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'rl:sync',
  points: 10,
  duration: 3600,
  insuranceLimiter: new RateLimiterMemory({ points: 10, duration: 3600 }),
});

function reject429(res: Response, rejection: unknown, error: string, message: string) {
  const retryAfterSeconds =
    rejection instanceof RateLimiterRes ? Math.ceil(rejection.msBeforeNext / 1000) : 60;
  res.set('Retry-After', String(Math.max(1, retryAfterSeconds)));
  return res.status(429).json({ success: false, error, message });
}

export async function globalRateLimit(req: Request, res: Response, next: NextFunction) {
  try {
    await globalLimiter.consume(req.ip ?? 'unknown');
    return next();
  } catch (rejection) {
    return reject429(res, rejection, 'RATE_LIMIT_EXCEEDED', 'Too many requests. Please slow down.');
  }
}

/** Mount AFTER sessionMiddleware so the key is the authenticated user. */
export async function userSyncRateLimit(req: Request, res: Response, next: NextFunction) {
  const key = req.session?.id ?? req.ip ?? 'unknown';
  try {
    await syncLimiter.consume(key);
    return next();
  } catch (rejection) {
    return reject429(
      res,
      rejection,
      'SYNC_RATE_LIMIT_EXCEEDED',
      'Too many sync requests. You can trigger up to 10 syncs per hour.',
    );
  }
}
