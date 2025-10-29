import redis from "../config/redis";
import prisma from "../db";

type SessionData = {
  id: string;
  email: string;
  expiresAt?: string; // ✅ optional field to store expiry in Redis
} | null;

const sessionMiddleware = async (req, res, next) => {
  try {
    let sessionId = req.cookies?.sessionId || req.headers?.authorization;
    console.log("[SESSION] Extracted session ID:", sessionId);

    if (!sessionId) {
      console.log("[SESSION] No session ID found, unauthorized request");
      return res.status(401).json({ message: "Unauthorized" });
    }

    let sessionData: SessionData = null;

    // Check Redis for session
    const redisSession = await redis.get(`session:${sessionId}`);
    console.log("[SESSION] Redis session data:", redisSession);

    if (redisSession) {
      try {
        const parsed = JSON.parse(redisSession);

        // ✅ Ensure type correctness
        if (parsed?.expiresAt && new Date() > new Date(parsed.expiresAt)) {
          console.log("[SESSION] Redis session expired, removing...");
          await redis.del(`session:${sessionId}`);
        } else {
          sessionData = parsed;
          console.log("[SESSION] Parsed Redis session data:", sessionData);
        }
      } catch (err) {
        console.warn("[SESSION] Failed to parse Redis session. Removing corrupt data...");
        await redis.del(`session:${sessionId}`);
      }
    }

    // If not in Redis, check DB
    if (!sessionData) {
      console.log("[SESSION] Session not found in Redis, checking PostgreSQL...");
      const dbSession = await prisma.session.findUnique({
        where: { session_id: sessionId },
        select: { session_id: true, user_id: true, expires_at: true },
      });

      console.log("[SESSION] DB session:", dbSession);

      if (dbSession?.user_id) {
        // ✅ Proper expiry validation
        const now = new Date();
        const expiresAt = new Date(dbSession.expires_at);

        if (now > expiresAt) {
          console.log("[SESSION] DB session expired, deleting...");
          try {
            await prisma.session.delete({ where: { session_id: sessionId } });
          } catch (err) {
            console.warn("[SESSION] Failed to delete expired session:", err.message);
          }
          return res.status(401).json({ message: "Session expired" });
        }

        const userInfo = await prisma.user.findUnique({
          where: { id: dbSession.user_id },
          select: { email: true },
        });

        console.log("[SESSION] User info from DB:", userInfo);

        if (userInfo) {
          sessionData = {
            id: dbSession.user_id,
            email: userInfo.email,
            expiresAt: expiresAt.toISOString(), // ✅ store expiry as string for Redis
          };

          console.log("[SESSION] Restoring session in Redis...");

          // ✅ TTL based on DB expiry (type-safe)
          const ttlSeconds = Math.max(
            0,
            Math.floor((expiresAt.getTime() - now.getTime()) / 1000)
          );

          await redis.setex(
            `session:${sessionId}`,
            ttlSeconds || parseInt(process.env.SESSION_TTL || "86400"),
            JSON.stringify(sessionData)
          );
        }
      }
    }

    if (!sessionData) {
      console.log("[SESSION] No session data found after DB check. Unauthorized.");
      return res.status(401).json({ message: "Unauthorized" });
    }

    console.log("[SESSION] Session validated successfully:", sessionData);
    req.session = sessionData;
    next();
  } catch (error) {
    console.error("[SESSION] Middleware error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export default sessionMiddleware;
