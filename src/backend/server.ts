import 'dotenv/config';
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { SyncCronJob } from '../jobs/syncCronJobs';
import { MigrationCronJob } from '../jobs/migrationCronJob';
import redis from '../config/redis';
import prisma from '../db/prisma';
import { bootstrap } from '../startup/bootstrap';

import { handleSpotifyLogin, handleSpotifyCallback } from '../auth/spotify/spotify';
import { handleYouTubeLogin, handleYouTubeCallback } from '../auth/youtube/youtube';
import { handleGoogleLogin, handleGoogleCallback } from '../auth/google/google';

import sessionMiddleware from '../middlewares/sessionMiddleware';

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
import migrationRoutes from './routes/migration.routes';

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cookieParser());
app.use(
  cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'https://syncit-app-1.vercel.app'],
    credentials: true,
  }),
);
app.use(bodyParser.json());

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

app.get('/sessionmid', sessionMiddleware);
app.use('/api/auto-sync', autoSyncRoutes);
app.use('/api/migration', migrationRoutes);

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

/* ================= SERVER START ================= */

let server: any;
let isShuttingDown = false;

async function startServer() {
  try {
    await bootstrap();

    // Start cron jobs only after infrastructure is validated
    SyncCronJob.start();
    MigrationCronJob.start();

    server = app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  } catch (err: any) {
    console.error('⛔ Server startup aborted');
    console.error('Reason:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

startServer();

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

['SIGINT', 'SIGTERM'].forEach((sig) => {
  process.on(sig, () => cleanup(sig));
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  cleanup('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
  cleanup('unhandledRejection');
});
