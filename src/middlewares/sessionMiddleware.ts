import redis from '../config/redis';
import prisma from '../db';

type SessionData = { id: string; email: string } | null;

const sessionMiddleware = async (req, res, next) => {
    try {
        console.log('[SESSION] Incoming cookies:', req.cookies);
        console.log('[SESSION] Incoming headers:', req.headers);

        let sessionId = req.cookies?.sessionId || req.headers?.authorization;
        console.log('[SESSION] Extracted session ID:', sessionId);

        if (!sessionId) {
            console.log('[SESSION] No session ID found, unauthorized request');
            return res.status(401).json({ message: 'Unauthorized' });
        }

        let sessionData: SessionData = null;

        // Check Redis for session
        let redisSession = await redis.get(`session:${sessionId}`);
        console.log('[SESSION] Redis session data:', redisSession);

        if (redisSession) {
            try {
                sessionData = JSON.parse(redisSession);
                console.log('[SESSION] Parsed Redis session data:', sessionData);
            } catch (err) {
                console.warn('[SESSION] Failed to parse Redis session. Removing corrupt data...');
                await redis.del(`session:${sessionId}`);
            }
        }

        // If not in Redis, check DB
        if (!sessionData) {
            console.log('[SESSION] Session not found in Redis, checking PostgreSQL...');
            const dbSession = await prisma.session.findUnique({
                where: { session_id: sessionId }
            });

            console.log('[SESSION] DB session:', dbSession);

            if (dbSession?.user_id) {
                const userInfo = await prisma.user.findUnique({
                    where: { id: dbSession.user_id },
                    select: { email: true }
                });

                console.log('[SESSION] User info from DB:', userInfo);

                if (userInfo) {
                    sessionData = { id: dbSession.user_id, email: userInfo.email };
                    console.log('[SESSION] Restoring session in Redis...');
                    await redis.setex(
                        `session:${sessionId}`,
                        parseInt(process.env.SESSION_TTL || "86400"),
                        JSON.stringify(sessionData)
                    );
                }
            }
        }

        if (!sessionData) {
            console.log('[SESSION] No session data found after DB check. Unauthorized.');
            return res.status(401).json({ message: 'Unauthorized' });
        }

        console.log('[SESSION] Session validated successfully:', sessionData);
        req.session = sessionData;
        next();
    } catch (error) {
        console.error('[SESSION] Middleware error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

export default sessionMiddleware;
