import axios from 'axios';
import { AxiosError } from 'axios';  // Import AxiosError
import { get_SpotifyAccessToken, refreshSpotifyToken } from '../../OAuth/tokenManagement/spotifyTokenUtil';

let spotifyTrackArray = [];

const MAX_RETRIES = 3; // Maximum number of retries

export const searchSpotifyTracks = async (req, res) => {

  let retryCount = 0;

  while (retryCount < MAX_RETRIES) {
    try {
      let accessToken = await get_SpotifyAccessToken();
      await fetchSpotifyTracks(accessToken);
      console.log(accessToken)
      res.json({ done: "done" });
      return; // Exit function after successful fetch

    } catch (error) {
      if (error instanceof AxiosError && error.response && error.response.status === 401) {
        console.log("Access token expired, refreshing token...");
        await refreshSpotifyToken();
        retryCount += 1;
        console.log(`Retrying... Attempt ${retryCount}/${MAX_RETRIES}`);
        
        // Continue to retry the fetchSpotifyTracks with the new token
        if (retryCount < MAX_RETRIES) {
          console.log("Retrying fetchSpotifyTracks...");
          continue; // This will restart the while loop with a new access token
        }
        
        // If maximum retries reached
        console.error('Max retries reached. Unable to fetch tracks.');
        res.status(500).json({ error: 'Failed to fetch tracks after multiple attempts' });
        return;
      } else {
        console.error('Error fetching tracks:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Failed to fetch tracks' });
        return;
      }
    }
  }
};


const fetchSpotifyTracks = async (accessToken) => {
  try {
    console.log("inside request");
    const response = await axios.get('https://api.spotify.com/v1/me/tracks', {
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      params: {
        limit: 17,
        offset: 0
      }
    });

    spotifyTrackArray = response.data.items.map(item => ({
      track: item.track,
      trackName: item.track.name,
      artists: item.track.artists.map(artist => artist.name).join(', '),
      albumName: item.track.album.name,
      albumType: item.track.album.album_type,
      releaseDate: item.track.album.release_date,
      durationMs: item.track.duration_ms,
    }));

    console.log('--------------------------------------------');
    spotifyTrackArray.forEach((video) => {
      console.log(`  Track Name: ${video.trackName}`);
      console.log(`  Artists: ${video.artists}`);
      console.log(`  Album Name: ${video.albumName}`);
      console.log(`  Album Type: ${video.albumType}`);
      console.log(`  Release Date: ${video.releaseDate}`);
      console.log(`  Duration (ms): ${video.durationMs}`);
      console.log('-------------------------------------');
    });

    console.log("request sent");

    return response; // Return the response to be used in `searchSpotifyTracks`

  } catch (error) {
    throw error; // Propagate the error to be handled in `searchSpotifyTracks`
  }
};


export { spotifyTrackArray };
