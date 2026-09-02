import { Request, Response } from 'express';
import prisma from '../../db/prisma';
import redis from '../../config/redis';

/**
 * GET /health — liveness/readiness for load balancers and the container
 * healthcheck (P2-12). DB down is always unhealthy; Redis down is unhealthy
 * in production (hard dependency there) and degraded-but-ok in dev.
 *
 * This route is registered BEFORE the global rate limiter so orchestrator
 * probes never consume points — which also means it is unauthenticated and
 * unlimited. Every call used to run `SELECT 1` plus a Redis PING, so a flood
 * amplified 1:1 into database work and could exhaust the connection pool.
 *
 * Results are therefore cached for HEALTH_CACHE_MS and probes are
 * single-flighted: concurrent misses share one round trip, so an unbounded
 * flood still costs at most one DB query per cache window.
 */
const CACHE_MS = Number(process.env.HEALTH_CACHE_MS ?? 5000);

type Probe = { dbOk: boolean; redisOk: boolean };

let cached: (Probe & { at: number }) | null = null;
let inFlight: Promise<Probe> | null = null;

async function runProbe(): Promise<Probe> {
  let dbOk = false;
  let redisOk = false;

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch {
    dbOk = false;
  }

  try {
    await redis.ping();
    redisOk = true;
  } catch {
    redisOk = false;
  }

  return { dbOk, redisOk };
}

async function getHealth(): Promise<Probe> {
  if (cached && Date.now() - cached.at < CACHE_MS) {
    return { dbOk: cached.dbOk, redisOk: cached.redisOk };
  }

  // Single-flight: a burst of concurrent misses shares one probe instead of
  // opening a connection each.
  if (!inFlight) {
    inFlight = runProbe()
      .then((result) => {
        cached = { ...result, at: Date.now() };
        return result;
      })
      .finally(() => {
        inFlight = null;
      });
  }

  return inFlight;
}

export async function healthHandler(_req: Request, res: Response) {
  const { dbOk, redisOk } = await getHealth();

  const healthy = dbOk && (redisOk || process.env.NODE_ENV !== 'production');

  return res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'unhealthy',
    db: dbOk,
    redis: redisOk,
    uptimeSeconds: Math.round(process.uptime()),
  });
}

/** Test seam: drop memoised state so suites can assert fresh probes. */
export function __resetHealthCache() {
  cached = null;
  inFlight = null;
}
