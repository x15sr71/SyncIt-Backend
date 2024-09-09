import axios from 'axios';
import { AxiosError } from 'axios';  // Import AxiosError
import { get_SpotifyAccessToken, refreshSpotifyToken } from '../../OAuth/tokenManagement/spotifyTokenUtil';
import { hashId } from '../../OAuth/utility/encrypt';
import prisma from '../../db';

let spotifyTrackArray = [];

const MAX_RETRIES = 3; // Maximum number of retries

export const searchSpotifyTracks = async (req, res) => {

  let retryCount = 0;

  while (retryCount < MAX_RETRIES) {
    try {
      let accessToken = await get_SpotifyAccessToken();
      await fetchSpotifyTracks(accessToken);
      //console.log(accessToken);
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
  let url = 'https://api.spotify.com/v1/me/tracks';
  let allTracks = [];

  try {
    console.log("Fetching tracks...");
    
    while (url) {
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`
        },
        params: {
          limit: 50,  // Max number of tracks per request
          offset: 0   // Pagination offset
        }
      });

      // Add the current page of tracks to the allTracks array
      allTracks = allTracks.concat(response.data.items.map(item => ({
        trackId: item.track.id,
        track: item.track,
        trackName: item.track.name,
        artists: item.track.artists.map(artist => artist.name).join(', '),
        albumName: item.track.album.name,
        albumType: item.track.album.album_type,
        releaseDate: item.track.album.release_date,
        durationMs: item.track.duration_ms,
      })));

      const trackIDs = response.data.items.map(item => item.track.id);

      const { hash } = hashId(response);

      const updatePlaylistHash = await prisma.spotifyData.updateMany({
        where: {
          username: "Chandragupt Singh"
        },
        data: {
          last_playlist_hash: hash,
          last_SyncedAt: new Date()
        }
      })

      console.log(hash)

      // Log the current page of tracks
      // console.log('--------------------------------------------');
      // let trackNumber = 1;
      // response.data.items.forEach(item => {
      //   console.log(`  TrackNumber: ${trackNumber}`)
      //   console.log(`  TrackID: ${item.track.id}`)
      //   console.log(`  Track Name: ${item.track.name}`);
      //   console.log(`  Artists: ${item.track.artists.map(artist => artist.name).join(', ')}`);
      //   console.log(`  Album Name: ${item.track.album.name}`);
      //   console.log(`  Album Type: ${item.track.album.album_type}`);
      //   console.log(`  Release Date: ${item.track.album.release_date}`);
      //   console.log(`  Duration (ms): ${item.track.duration_ms}`);
      //   console.log('-------------------------------------');

      //   trackNumber++;

      // });



      // Check for the next page of results
      url = response.data.next;  // The URL for the next page of results, or null if no more pages
    }

    spotifyTrackArray = allTracks;
    console.log("All tracks fetched.");

    return allTracks; // Return all the tracks fetched

  } catch (error) {
    throw error; // Propagate the error to be handled in `searchSpotifyTracks`
  }
};

export { spotifyTrackArray };
