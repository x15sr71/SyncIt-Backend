import express, { application } from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import { handleSpotifyLogin, handleSpotifyCallback } from '../OAuth/spotify';
import { handleYouTubeLogin, handleYouTubeCallback } from '../OAuth/youtube';
// import { handleGoogleLogin } from '../OAuth/google';
// import { handleGoogleCallback } from '../OAuth/google';
import { searchSpotifyTracks } from './extractTracks/spotifyExt';
import { searchYoutubeTracks } from './extractTracks/youtubeExt';
import { modify_YoutubePlaylist } from './modify/youtube/modify_YtLikePlaylist'
import { addToSptLikePlaylist } from './modify/spotify/addToSptLikePlaylist'
import { removeFromSptLikePlaylist } from './modify/spotify/removeFromLikePlaylist'
import { test } from '../OAuth/utility/test'
// import { test2 } from '../OAuth/utility/test2'
import { searchTracksOnYoutube } from './modify/searchYoutube/searchYoutube'
import { queryDataForYoutube } from '../OAuth/utility/preProcessOpenAi'
import { migrateWholeSpotifyPlaylistToYoutubeplaylist } from '../backend/modify/playlistMigrations'

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

// app.get('/google/login', handleGoogleLogin);
// app.get('/google/callback', handleGoogleCallback);

app.get('/spotify/login', handleSpotifyLogin);
app.get('/spotify/callback', handleSpotifyCallback);

app.get('/youtube/login', handleYouTubeLogin);
app.get('/youtube/callback', handleYouTubeCallback);

app.get('/spotifyTracks', searchSpotifyTracks)
app.get('/youtubeTrack', searchYoutubeTracks)

app.get('/modifyYoutubeLikePlaylist', modify_YoutubePlaylist)

app.get('/addtoSpt', addToSptLikePlaylist)
app.get('/removefromSpt', removeFromSptLikePlaylist)
app.get('/searchTracksOnYoutube', queryDataForYoutube)


app.get('/test', migrateWholeSpotifyPlaylistToYoutubeplaylist)

app.post('/sync-playlists', async (req, res) => {
    const { spotifyToken, youtubeToken } = req.body;

    res.json({ message: 'Playlists synced successfully!' });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
