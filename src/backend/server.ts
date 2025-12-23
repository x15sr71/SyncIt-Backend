import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";

import redis from "../config/redis";
import prisma from "../db/prisma";
import { bootstrap } from "../startup/bootstrap";

import {
  handleSpotifyLogin,
  handleSpotifyCallback,
} from "../auth/spotify/spotify";
import {
  handleYouTubeLogin,
  handleYouTubeCallback,
} from "../auth/youtube/youtube";
import { handleGoogleLogin, handleGoogleCallback } from "../auth/google/google";

import sessionMiddleware from "../middlewares/sessionMiddleware";

import youtubeRoutes from "./routes/youtube.routes";
import spotifyRoutes from "./routes/spotify.routes";
import emptySpotifyPlaylist from "./routes/emptySpotify.routes";
import emptyYoutubePlaylist from "./routes/emptyYoutube.route";
import getSpotifyPlaylistsRouter from "./routes/spotifyGetPlaylists.route";
import getYoutubePlaylistsRouter from "./routes/youtubeGetPlaylist.route";
import getSpotifyPlaylistContentHandler from "./routes/spotifyContent.route";
import getYoutubePlaylistContentHandler from "./routes/youtubeContent.route";
import migrateSpotifyToYoutubeHandler from "./routes/migrateSpotifyToYoutube.router";
import migrateYoutubeToSpotifyHandler from "./routes/migrateYoutubeToSpotify.route";
import getNotFoundTracksRouter from "./routes/getNotFoundTracks.route";
import spotifyActionsRouter from "./routes/routes/spotifyActions.routes";
import youtubeactionrouter from "./routes/routes/youtubeActions.routes";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cookieParser());
app.use(
  cors({
    origin: ["http://localhost:3000", "https://syncit-app-1.vercel.app/"],
    credentials: true,
  })
);
app.use(bodyParser.json());

/* ================= ROUTES ================= */

app.get("/google/login", handleGoogleLogin);
app.get("/google/callback", handleGoogleCallback);

app.get("/spotify/login", sessionMiddleware, handleSpotifyLogin);
app.get("/spotify/callback", sessionMiddleware, handleSpotifyCallback);

app.get("/youtube/login", sessionMiddleware, handleYouTubeLogin);
app.get("/youtube/callback", sessionMiddleware, handleYouTubeCallback);

app.use("/", spotifyRoutes);
app.use("/", youtubeRoutes);
app.use("/", emptySpotifyPlaylist);
app.use("/", emptyYoutubePlaylist);
app.use("/", getSpotifyPlaylistsRouter);
app.use("/", getYoutubePlaylistsRouter);
app.use("/", getSpotifyPlaylistContentHandler);
app.use("/", getYoutubePlaylistContentHandler);
app.use("/", migrateSpotifyToYoutubeHandler);
app.use("/", migrateYoutubeToSpotifyHandler);
app.use("/", getNotFoundTracksRouter);

app.use("/spotify", spotifyActionsRouter);
app.use("/youtube", youtubeactionrouter);

app.get('/sessionmid', sessionMiddleware)
app.use("/api/auto-sync", autoSyncRoutes);

SyncCronJob.start();

app.get("/sessionmid", sessionMiddleware);

app.post("/sync-playlists", async (req, res) => {
  res.json({ message: "Playlists synced successfully!" });
});

/* ================= SERVER START ================= */

let server: any;
let isShuttingDown = false;

async function startServer() {
  try {
    await bootstrap();

    server = app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error("⛔ Server startup aborted");
    console.error("Reason:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

startServer();

/* ================= CLEANUP ================= */

const cleanup = async (signal?: string) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\nReceived ${signal || "shutdown"}, cleaning up...`);

  const forceTimeout = setTimeout(() => {
    console.error("Forcing shutdown due to timeout");
    process.exit(1);
  }, 10000);
  forceTimeout.unref();

  try {
    if (server) {
      await new Promise<void>((resolve) =>
        server.close(() => resolve())
      );
      console.log("HTTP server closed");
    }

    await prisma.$disconnect();
    console.log("Prisma disconnected");

    try {
      await redis.quit();
      console.log("Redis disconnected");
    } catch (err) {
      console.error("Error disconnecting Redis:", err);
    }

    process.exit(0);
  } catch (err) {
    console.error("Cleanup error:", err);
    process.exit(1);
  }
};

["SIGINT", "SIGTERM"].forEach((sig) => {
  process.on(sig, () => cleanup(sig));
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  cleanup("uncaughtException");
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
  cleanup("unhandledRejection");
});
