import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import dotenv from "dotenv";
import redies from "../config/redis";
import cookieParser from "cookie-parser";
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
import getSpotifyPlaylistsRouter from "./routes/spotifyGetPlaylists.route";
import getYoutubePlaylistsRouter from "./routes/youtubeGetPlaylist.route";
import getSpotifyPlaylistContentHandler from "./routes/spotifyContent.route";
import getYoutubePlaylistContentHandler from "./routes/youtubeContent.route";
import emptyYoutubePlaylist from "./routes/emptyYoutube.route";
import migrateSpotifyToYoutubeHandler from "./routes/migrateSpotifyToYoutube.router";
import migrateYoutubeToSpotifyHandler from "./routes/migrateYoutubeToSpotify.route";
import getNotFoundTracksRouter from "./routes/getNotFoundTracks.route";
import spotifyActionsRouter from "./routes/routes/spotifyActions.routes";
import youtubeactionrouter from "./routes/routes/youtubeActions.routes";
import { MigrationCronJob } from "../jobs/migrationCronJob";
// import migrationRoutes from "./backend/routes/migration.routes";

dotenv.config();
const app = express();
app.use(cookieParser());
const PORT = process.env.PORT || 3002;

// In your backend CORS configuration
app.use(
  cors({
    origin: ["http://localhost:3000", "https://syncit-app-1.vercel.app/"], // Your frontend URLs
    credentials: true, // Allow cookies to be sent
  })
);
app.use(bodyParser.json());

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
app.get("/sessionmid", sessionMiddleware);
// app.use("/api/migration", migrationRoutes);

// Start the cron job when server starts
MigrationCronJob.start();

app.post("/sync-playlists", async (req, res) => {
  const { spotifyToken, youtubeToken } = req.body;
  res.json({ message: "Playlists synced successfully!" });
});

const server = app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

let isShuttingDown = false;

const cleanup = async (signal?: string) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\nReceived ${signal || "shutdown request"}, cleaning up...`);

  // Force shutdown timer
  const shutdownTimeout = setTimeout(() => {
    console.error("Forcing shutdown due to timeout.");
    process.exit(1);
  }, 10000);
  shutdownTimeout.unref();

  try {
    if (redies && redies.quit) {
      try {
        await redies.quit();
        console.log("Redis connection closed.");
      } catch (err) {
        console.error("Error closing Redis:", err);
      }
    }

    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });

    console.log("Server closed, releasing port.");
    process.exit(0);
  } catch (error) {
    console.error("Error during cleanup:", error);
    process.exit(1);
  }
};

// Handle termination signals
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
