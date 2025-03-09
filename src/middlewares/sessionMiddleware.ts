import redis from '../config/redis';
import prisma from '../db';

type SessionData = { id: string; email: string } | null;

const sessionMiddleware = async (req, res, next) => {
    try {
        console.log(req.cookies);
        let sessionId = req.cookies?.sessionId || req.headers?.authorization;
        console.log("Session ID:", sessionId);

        if (!sessionId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        let sessionData: SessionData = null; 

        // Check Redis for session
        let redisSession = await redis.get(`session:${sessionId}`);

        if (redisSession) {
            try {
                sessionData = JSON.parse(redisSession);
            } catch (err) {
                console.error("Invalid session data in Redis, removing...");
                await redis.del(`session:${sessionId}`);
                sessionData = null;
            }
        }

        // If session is not found in Redis, check PostgreSQL
        if (!sessionData) {
            console.log("Session not found in Redis, checking PostgreSQL...");

            const dbSession = await prisma.session.findUnique({
                where: { session_id: sessionId }
            });

            if (dbSession?.user_id) {
                const userInfo = await prisma.user.findUnique({
                    where: { id: dbSession.user_id },
                    select: { email: true }
                });

                if (userInfo) {
                    sessionData = { id: dbSession.user_id, email: userInfo.email };
                    console.log("Restored session in Redis");

                    // Restore session in Redis
                    await redis.setex(
                        `session:${sessionId}`,
                        parseInt(process.env.SESSION_TTL || "86400"),
                        JSON.stringify(sessionData)
                    );
                }
            }
        }

        if (!sessionData) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        req.session = sessionData;
        next();
    } catch (error) {
        console.error('Session Middleware Error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

export default sessionMiddleware;
