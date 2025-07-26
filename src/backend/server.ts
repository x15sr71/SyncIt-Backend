import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import redies from '../config/redis';
import cookieParser from 'cookie-parser'
import { handleSpotifyLogin, handleSpotifyCallback } from '../auth/spotify/spotify';
import { handleYouTubeLogin, handleYouTubeCallback } from '../auth/youtube/youtube';
import { handleGoogleLogin, handleGoogleCallback } from '../auth/google/google';
import sessionMiddleware from '../middlewares/sessionMiddleware';
import youtubeRoutes from './routes/youtube.routes';
import spotifyRoutes from './routes/spotify.routes';
import emptySpotifyPlaylist from './routes/emptySpotify.routes';
import getSpotifyPlaylistsRouter from './routes/spotifyGetPlaylists.route';
import getYoutubePlaylistsRouter from './routes/youtubeGetPlaylist.route';
import getSpotifyPlaylistContentHandler from './routes/spotifyContent.route';
import getYoutubePlaylistContentHandler from './routes/youtubeContent.route';
import emptyYoutubePlaylist from './routes/emptyYoutube.route';
import migrateSpotifyToYoutubeHandler from './routes/migrateSpotifyToYoutube.router';
import migrateYoutubeToSpotifyHandler from './routes/migrateYoutubeToSpotify.route';
import getNotFoundTracksRouter from './routes/getNotFoundTracks.route';

dotenv.config();
const app = express();
app.use(cookieParser());
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

app.get('/google/login', handleGoogleLogin);
app.get('/google/callback', handleGoogleCallback);
app.get('/spotify/login', sessionMiddleware, handleSpotifyLogin);
app.get('/spotify/callback', sessionMiddleware, handleSpotifyCallback);
app.get('/youtube/login', sessionMiddleware, handleYouTubeLogin);
app.get('/youtube/callback', sessionMiddleware, handleYouTubeCallback);
app.use("/", spotifyRoutes);
app.use("/", youtubeRoutes);
app.use("/", emptySpotifyPlaylist);
app.use("/", emptyYoutubePlaylist);
app.use('/', getSpotifyPlaylistsRouter);
app.use('/', getYoutubePlaylistsRouter)
app.use('/', getSpotifyPlaylistContentHandler);
app.use('/', getYoutubePlaylistContentHandler);
app.use('/', migrateSpotifyToYoutubeHandler);
app.use('/', migrateYoutubeToSpotifyHandler);
app.use("/", getNotFoundTracksRouter)
app.get('/sessionmid', sessionMiddleware)

app.post('/sync-playlists', async (req, res) => {
    const { spotifyToken, youtubeToken } = req.body;
    res.json({ message: 'Playlists synced successfully!' });
});

const server = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// Graceful shutdown handler - UPDATED
const cleanup = async () => {
    console.log('Shutting down server...');

    // Force shutdown timer
    const shutdownTimeout = setTimeout(() => {
        console.error('Forcing shutdown due to timeout.');
        process.exit(1);
    }, 10000);

    shutdownTimeout.unref(); // Allow process to exit if cleanup finishes

    try {
        if (redies && redies.quit) {
            await redies.quit();
            console.log('Redis connection closed.');
        }

        server.close((err) => {
            if (err) {
                console.error('Error closing server:', err);
                process.exit(1);
            } else {
                console.log('Server closed, releasing port.');
                process.exit(0);
            }
        });
    } catch (error) {
        console.error('Error during cleanup:', error);
        process.exit(1);
    }
};

// Handle termination signals
process.on('SIGINT', () => {
    cleanup();
});
process.on('SIGTERM', () => {
    cleanup();
});
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    cleanup();
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection:', reason);
    cleanup();
});
