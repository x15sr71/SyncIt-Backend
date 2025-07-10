import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import redies from '../config/redis';
import cookieParser from 'cookie-parser'
import { handleSpotifyLogin, handleSpotifyCallback } from '../OAuth/spotify';
import { handleYouTubeLogin, handleYouTubeCallback } from '../OAuth/youtube';
import { handleGoogleLogin, handleGoogleCallback } from '../OAuth/google';
import { modify_YoutubePlaylist } from './modify/youtube/modify_YtLikePlaylist';
import { addToSptLikePlaylist } from './modify/spotify/addToSptLikePlaylist';
import { emptyLikedTracks } from '../backend/modify/spotify/removeFromSpotifyPlaylist';
import { migrateWholeYoutubePlaylistToSpotifyplaylist } from '../backend/modify/playlistMigrations';
import sessionMiddleware from '../middlewares/sessionMiddleware';
import youtubeRoutes from './routes/youtube.routes';
import spotifyRoutes from './routes/spotify.routes';
import emptySpotifyPlaylist from './routes/emptySpotify.routes';

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
app.use("/api", spotifyRoutes);
app.use("/", youtubeRoutes);
app.get('/modifyYoutubeLikePlaylist', sessionMiddleware, modify_YoutubePlaylist);
app.get('/addtoSpt', sessionMiddleware, addToSptLikePlaylist);
app.get('/removefromSpt', sessionMiddleware, emptyLikedTracks);
app.use("/emptySpotify", emptySpotifyPlaylist);
app.get('/test', sessionMiddleware, migrateWholeYoutubePlaylistToSpotifyplaylist);
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
