import { Request, Response } from 'express';
import prisma from '../../db/prisma';
import redis from '../../config/redis';

/**
 * GET /health — liveness/readiness for load balancers and the container
 * healthcheck (P2-12). DB down is always unhealthy; Redis down is unhealthy
 * in production (hard dependency there) and degraded-but-ok in dev.
 */
export async function healthHandler(_req: Request, res: Response) {
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

  const healthy = dbOk && (redisOk || process.env.NODE_ENV !== 'production');

  return res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'unhealthy',
    db: dbOk,
    redis: redisOk,
    uptimeSeconds: Math.round(process.uptime()),
  });
}
