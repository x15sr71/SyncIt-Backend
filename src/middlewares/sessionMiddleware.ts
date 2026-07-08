import { Request, Response, NextFunction } from 'express';
import redis from '../config/redis';
import prisma from '../db/prisma';

export type SessionData = {
  id: string;
  email: string;
  expiresAt?: string;
};

const sessionMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Prevent duplicate executions in a single request
    if (req._sessionChecked) return next();
    req._sessionChecked = true;

    const sessionId = req.cookies?.sessionId;

    if (!sessionId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    let sessionData: SessionData | null = null;

    // Check Redis first — in its own try/catch so a Redis outage falls
    // through to the DB path instead of 500ing every authenticated
    // route (P1-4).
    let redisSession: string | null = null;
    try {
      redisSession = await redis.get(`session:${sessionId}`);
    } catch (redisError: any) {
      console.warn('[SESSION] Redis unavailable, falling back to DB:', redisError?.message);
    }

    if (redisSession) {
      try {
        const parsed = JSON.parse(redisSession);

        if (parsed?.expiresAt && new Date() > new Date(parsed.expiresAt)) {
          await redis.del(`session:${sessionId}`).catch(() => {});
          res.clearCookie('sessionId');
        } else {
          sessionData = parsed;
        }
      } catch {
        await redis.del(`session:${sessionId}`).catch(() => {});
      }
    }

    // Fall back to DB
    if (!sessionData) {
      const dbSession = await prisma.session.findUnique({
        where: { session_id: sessionId },
        select: { session_id: true, user_id: true, expires_at: true },
      });

      if (dbSession?.user_id) {
        const now = Date.now();
        const expiresAt = new Date(dbSession.expires_at).getTime();

        if (now > expiresAt) {
          try {
            await prisma.session.delete({ where: { session_id: sessionId } });
          } catch {
            // ignore — may already be deleted
          }
          await redis.del(`session:${sessionId}`).catch(() => {});
          res.clearCookie('sessionId');
          return res.status(401).json({ message: 'Session expired' });
        }

        const userInfo = await prisma.user.findUnique({
          where: { id: dbSession.user_id },
          select: { email: true },
        });

        if (userInfo) {
          sessionData = {
            id: dbSession.user_id,
            email: userInfo.email,
            expiresAt: new Date(expiresAt).toISOString(),
          };

          const ttlSeconds = Math.max(0, Math.floor((expiresAt - now) / 1000));

          // Best-effort cache backfill — a Redis outage must not fail the
          // request after the DB already authenticated it (P1-4).
          await redis
            .setex(
              `session:${sessionId}`,
              ttlSeconds || parseInt(process.env.SESSION_TTL || '86400'),
              JSON.stringify(sessionData),
            )
            .catch(() => {});
        }
      }
    }

    if (!sessionData) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    req.session = sessionData;
    next();
  } catch (error: any) {
    console.error('[SESSION] Middleware error:', error);

    if (error?.name?.includes('Prisma')) {
      return res.status(503).json({ message: 'Service temporarily unavailable' });
    }

    res.status(500).json({ message: 'Internal Server Error' });
  }
};

export default sessionMiddleware;
