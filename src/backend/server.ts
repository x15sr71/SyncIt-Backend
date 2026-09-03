import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { logger } from '../config/logger';
import { globalRateLimit } from '../middlewares/rateLimit';
import { healthHandler } from './controllers/health.controller';
import { SyncCronJob } from '../jobs/syncCronJobs';
import redis from '../config/redis';
import prisma from '../db/prisma';
import { bootstrap } from '../startup/bootstrap';

import { handleSpotifyLogin, handleSpotifyCallback } from '../auth/spotify/spotify';
import { handleYouTubeLogin, handleYouTubeCallback } from '../auth/youtube/youtube';
import { handleGoogleLogin, handleGoogleCallback } from '../auth/google/google';

import sessionMiddleware from '../middlewares/sessionMiddleware';
import { meHandler } from './controllers/me.controller';

import youtubeRoutes from './routes/youtube.routes';
import spotifyRoutes from './routes/spotify.routes';
import emptySpotifyPlaylist from './routes/emptySpotify.routes';
import emptyYoutubePlaylist from './routes/emptyYoutube.route';
import getSpotifyPlaylistsRouter from './routes/spotifyGetPlaylists.route';
import getYoutubePlaylistsRouter from './routes/youtubeGetPlaylist.route';
import getSpotifyPlaylistContentHandler from './routes/spotifyContent.route';
import getYoutubePlaylistContentHandler from './routes/youtubeContent.route';
import migrateSpotifyToYoutubeHandler from './routes/migrateSpotifyToYoutube.router';
import migrateYoutubeToSpotifyHandler from './routes/migrateYoutubeToSpotify.route';
import getNotFoundTracksRouter from './routes/getNotFoundTracks.route';
import spotifyActionsRouter from './routes/spotifyActions.routes';
import youtubeactionrouter from './routes/youtubeActions.routes';
import autoSyncRoutes from './routes/autoSync.routes';

const app = express();
const PORT = process.env.PORT || 3002;

// Production traffic arrives through the Next.js rewrite proxy (and any
// platform load balancer); trust it so req.ip and secure-cookie detection see
// the real client.
//
// SECURITY: `trust proxy` decides whether X-Forwarded-For is believed. A bare
// hop count trusts whoever is on the other end of the socket, so if this
// backend is reachable directly, an attacker sets their own X-Forwarded-For
// and gets a fresh rate-limit bucket per request — verified: 150 requests
// with a rotating header produced zero 429s. Naming the proxy's IP/CIDR makes
// Express ignore the header from anyone else.
//
// TRUST_PROXY accepts: 'false' (no proxy — use the socket IP), a hop count,
// or a comma-separated IP/CIDR list (preferred in production).
const trustProxyRaw = process.env.TRUST_PROXY ?? '1';
const trustProxy: boolean | number | string[] =
  trustProxyRaw === 'false'
    ? false
    : /^\d+$/.test(trustProxyRaw)
      ? Number(trustProxyRaw)
      : trustProxyRaw.split(',').map((entry) => entry.trim());
app.set('trust proxy', trustProxy);

if (process.env.NODE_ENV === 'production' && !process.env.TRUST_PROXY) {
  logger.warn(
    'TRUST_PROXY is unset, defaulting to 1 hop. If this backend is reachable ' +
      'directly, per-IP rate limits can be bypassed by spoofing X-Forwarded-For. ' +
      'Set TRUST_PROXY to your proxy IP/CIDR, or "false" if there is no proxy.',
  );
}

const corsOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://127.0.0.1:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// CSP disabled: this is a JSON API, not an HTML origin; the Next.js app
// owns browser-facing security headers.
app.use(helmet({ contentSecurityPolicy: false }));

// Health check before logging/rate limiting: orchestrator probes must not
// consume rate-limit points or spam the request log.
app.get('/health', healthHandler);

// Structured request logging with request IDs (P2-12).
app.use(
  pinoHttp({
    logger,
    genReqId: (req) => (req.headers['x-request-id'] as string) ?? crypto.randomUUID(),
    autoLogging: {
      ignore: (req) => req.url === '/health',
    },
  }),
);

app.use(cookieParser());
app.use(
  cors({
    origin: corsOrigins,
    credentials: true,
  }),
);
// After cors so preflights don't consume points; before all routes.
app.use(globalRateLimit);
app.use(express.json());

/* ================= ROUTES ================= */

app.get('/google/login', handleGoogleLogin);
app.get('/google/callback', handleGoogleCallback);

app.get('/spotify/login', sessionMiddleware, handleSpotifyLogin);
app.get('/spotify/callback', sessionMiddleware, handleSpotifyCallback);

app.get('/youtube/login', sessionMiddleware, handleYouTubeLogin);
app.get('/youtube/callback', sessionMiddleware, handleYouTubeCallback);

app.use('/', spotifyRoutes);
app.use('/', youtubeRoutes);
app.use('/', emptySpotifyPlaylist);
app.use('/', emptyYoutubePlaylist);
app.use('/', getSpotifyPlaylistsRouter);
app.use('/', getYoutubePlaylistsRouter);
app.use('/', getSpotifyPlaylistContentHandler);
app.use('/', getYoutubePlaylistContentHandler);
app.use('/', migrateSpotifyToYoutubeHandler);
app.use('/', migrateYoutubeToSpotifyHandler);
app.use('/', getNotFoundTracksRouter);

app.use('/spotify', spotifyActionsRouter);
app.use('/youtube', youtubeactionrouter);

app.get('/me', sessionMiddleware, meHandler);
app.use('/api/auto-sync', autoSyncRoutes);

app.post('/auth/logout', sessionMiddleware, async (req, res) => {
  const sessionId = req.cookies?.sessionId;
  if (sessionId) {
    try {
      await redis.del(`session:${sessionId}`);
      await prisma.session.deleteMany({ where: { session_id: sessionId } });
    } catch {
      // best-effort cleanup
    }
    res.clearCookie('sessionId');
  }
  return res.json({ success: true, message: 'Logged out' });
});

/* ================= ERROR HANDLING ================= */

// Last-resort handler for anything a route passes to next(err) or throws
// synchronously. Must stay after every route registration.
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err }, 'Unhandled request error');
  if (res.headersSent) return;
  res.status(500).json({
    success: false,
    error: 'INTERNAL_ERROR',
    message: 'Something went wrong. Please try again.',
  });
});

/* ================= SERVER START ================= */

// Exported for supertest: importing this module must not listen, start
// cron jobs, or register exit handlers — that only happens when run as
// the entrypoint (see require.main check at the bottom).
export { app };

let server: any;
let isShuttingDown = false;

async function startServer() {
  try {
    await bootstrap();

    // Start cron jobs only after infrastructure is validated
    SyncCronJob.start();

    server = app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  } catch (err: any) {
    console.error('⛔ Server startup aborted');
    console.error('Reason:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

/* ================= CLEANUP ================= */

const cleanup = async (signal?: string) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\nReceived ${signal || 'shutdown'}, cleaning up...`);

  const forceTimeout = setTimeout(() => {
    console.error('Forcing shutdown due to timeout');
    process.exit(1);
  }, 10000);
  forceTimeout.unref();

  try {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      console.log('HTTP server closed');
    }

    await prisma.$disconnect();
    console.log('Prisma disconnected');

    try {
      await redis.quit();
      console.log('Redis disconnected');
    } catch (err: any) {
      console.error('Error disconnecting Redis:', err);
    }

    process.exit(0);
  } catch (err: any) {
    console.error('Cleanup error:', err);
    process.exit(1);
  }
};

if (require.main === module) {
  startServer();

  ['SIGINT', 'SIGTERM'].forEach((sig) => {
    process.on(sig, () => cleanup(sig));
  });

  process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    cleanup('uncaughtException');
  });

  // Deliberately NOT fatal. A rejected promise inside one request must not
  // take the server down for every other user — that turned a single request
  // from an account without Spotify connected into a full outage. Log loudly
  // and keep serving; uncaughtException above stays fatal because process
  // state really is unsafe to continue from there.
  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'Unhandled Rejection — server kept alive');
  });
}
