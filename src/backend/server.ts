import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import { handleSpotifyLogin, handleSpotifyCallback } from '../OAuth/spotify';
import { handleYouTubeLogin, handleYouTubeCallback } from '../OAuth/youtube';
// import { handleGoogleLogin } from '../OAuth/google';
// import { handleGoogleCallback } from '../OAuth/google';
import { searchSpotifyTracks } from './extractTracks/spotifyExt';
import { searchYoutubeTracks } from './extractTracks/youtubeExt';
import { modify_YotutubeLikePlaylist } from './modify/youtube/modify_YtLikePlaylist'
import { addToSptLikePlaylist } from './modify/spotify/addToSptLikePlaylist'
import { removeFromSptLikePlaylist } from './modify/spotify/removeFromLikePlaylist'
import { test } from './openAI/api_test'
// import get_AccessToken from '../api_test';
//import { openai_Call } from '../api_test';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Routes
// app.get('/google/login', handleGoogleLogin);
// app.get('/google/callback', handleGoogleCallback);

app.get('/spotify/login', handleSpotifyLogin);
app.get('/spotify/callback', handleSpotifyCallback);

app.get('/youtube/login', handleYouTubeLogin);
app.get('/youtube/callback', handleYouTubeCallback);

app.get('/spotifyTracks', searchSpotifyTracks)
app.get('/youtubeTrack', searchYoutubeTracks)

app.get('/modifyYoutubeLikePlaylist', modify_YotutubeLikePlaylist)

app.get('/addtoSpt', addToSptLikePlaylist)
app.get('/removefromSpt', removeFromSptLikePlaylist)

app.get('/test', test)

app.post('/sync-playlists', async (req, res) => {
    const { spotifyToken, youtubeToken } = req.body;

    // Implement your playlist syncing logic here

    res.json({ message: 'Playlists synced successfully!' });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
