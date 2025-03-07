// import redis from '../config/redis';
// /**
//  * Session Middleware: Manages user authentication using Redis and PostgreSQL.
//  */
// const sessionMiddleware = async (req, res, next) => {
//     try {
//         let sessionId = req.cookies.sessionId || req.headers.authorization;

//         if (!sessionId) {
//             // No session found, redirect to login
//             return res.redirect('/login');
//         }

//         // 1️⃣ Check Redis for session
//         let userId = await redis.get(`session:${sessionId}`);

//         if (!userId) {
//             console.log('Session not found in Redis, checking PostgreSQL...');

//             // 2️⃣ Check PostgreSQL if Redis doesn’t have it
//             const { rows } = await pool.query('SELECT user_id FROM sessions WHERE session_id = $1', [sessionId]);

//             if (rows.length > 0) {
//                 userId = rows[0].user_id;

//                 // 3️⃣ Restore session in Redis
//                 await redis.setex(`session:${sessionId}`, process.env.SESSION_TTL, userId);
//             } else {
//                 // No valid session found, reject request
//                 return res.status(401).json({ message: 'Unauthorized' });
//             }
//         }

//         req.sessionId = sessionId;
//         req.userId = userId;

//         next();
//     } catch (error) {
//         console.error('Session Middleware Error:', error);
//         res.status(500).json({ message: 'Internal Server Error' });
//     }
// };

// module.exports = sessionMiddleware;
