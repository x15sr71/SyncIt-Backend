import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import redies from '../config/redis';
import cookieParser from 'cookie-parser'

dotenv.config();
const app = express();
app.use(cookieParser());
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

// Import and use route handlers
import { handleSpotifyLogin, handleSpotifyCallback } from '../OAuth/spotify';
import { handleYouTubeLogin, handleYouTubeCallback } from '../OAuth/youtube';
import { handleGoogleLogin, handleGoogleCallback } from '../OAuth/google';
import { searchSpotifyTracks } from './extractTracks/spotifyExt';
import { searchYoutubeTracks } from './extractTracks/youtubeExt';
import { modify_YoutubePlaylist } from './modify/youtube/modify_YtLikePlaylist';
import { addToSptLikePlaylist } from './modify/spotify/addToSptLikePlaylist';
import { emptyLikedTracks } from '../backend/modify/spotify/removeFromSpotifyPlaylist';
import { queryDataForYoutube } from '../OAuth/utility/preProcessOpenAi';
import { migrateWholeYoutubePlaylistToSpotifyplaylist } from '../backend/modify/playlistMigrations';
import { handleCreatePlaylist } from './routeHandlers/handleSpotifyPlaylistceation';
import emptyPlaylist from './modify/emptySpotify/emptySpotifyPlaylist';
import sessionMiddleware from '../middlewares/sessionMiddleware';

app.get('/google/login', handleGoogleLogin);
app.get('/google/callback', handleGoogleCallback);

app.get('/spotify/login', handleSpotifyLogin);
app.get('/spotify/callback', handleSpotifyCallback);

app.get('/youtube/login', handleYouTubeLogin);
app.get('/youtube/callback', handleYouTubeCallback);

app.get('/spotifyTracks', searchSpotifyTracks);
app.get('/youtubeTrack', searchYoutubeTracks);
app.get('/modifyYoutubeLikePlaylist', modify_YoutubePlaylist);
app.get('/addtoSpt', addToSptLikePlaylist);
app.get('/removefromSpt', emptyLikedTracks);
app.get('/searchTracksOnYoutube', queryDataForYoutube);
app.post('/handleCreatePlaylist', handleCreatePlaylist);
app.get('/emptySpotify', emptyPlaylist);
app.get('/test', sessionMiddleware, migrateWholeYoutubePlaylistToSpotifyplaylist);
app.get('/sessionmid', sessionMiddleware)

app.post('/sync-playlists', async (req, res) => {
    const { spotifyToken, youtubeToken } = req.body;
    res.json({ message: 'Playlists synced successfully!' });
});

const server = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// Graceful shutdown handler
const cleanup = () => {
    console.log('Shutting down server...');

    server.close(() => {
        console.log('Server closed, releasing port.');
        process.exit(0);
    });

    // Close Redis connection if applicable
    if (redies && redies.quit) {
        redies.quit();
        console.log('Redis connection closed.');
    }
};

// Handle termination signals
process.on('SIGINT', cleanup);  // Ctrl+C
process.on('SIGTERM', cleanup); // Termination signal (e.g., from a process manager)
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    cleanup();
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection:', reason);
    cleanup();
});
