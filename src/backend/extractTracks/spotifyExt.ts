import axios from 'axios';
import { AxiosError } from 'axios';  // Import AxiosError
import { get_SpotifyAccessToken, refreshSpotifyToken } from '../../OAuth/tokenManagement/spotifyTokenUtil';
import { hashId } from '../../OAuth/utility/encrypt';
import prisma from '../../db';

let spotifyTrackArray = [];
const MAX_RETRIES = 3; // Maximum number of retries
const MAX_TRACKS = 100; // Maximum number of tracks to fetch

export const searchSpotifyTracks = async () => {
  let retryCount = 0;
  let accessToken = null;

  while (retryCount < MAX_RETRIES) {
    try {
      accessToken = await get_SpotifyAccessToken();

      // Exit if access token is not found or is invalid
      if (!accessToken) {
        console.error("Access token not found or invalid.");
        return { error: 'Access token not found' };
      }

      const tracks = await fetchSpotifyTracks(accessToken);
      return { status: "success", data: tracks };

    } catch (error) {
      if (error instanceof AxiosError && error.response && error.response.status === 401) {
        console.log("Access token expired, refreshing token...");
        try {
          const refreshedTokenData = await refreshSpotifyToken();
          if (refreshedTokenData && refreshedTokenData.access_token) {
            accessToken = refreshedTokenData.access_token; // Update the access token
            retryCount += 1;
            console.log(`Retrying... Attempt ${retryCount}/${MAX_RETRIES}`);
            // Continue to retry the fetchSpotifyTracks with the new token
            if (retryCount < MAX_RETRIES) {
              console.log("Retrying fetchSpotifyTracks...");
              continue; // This will restart the while loop with a new access token
            }
          } else {
            throw new Error("Failed to refresh access token.");
          }
        } catch (refreshError) {
          console.error('Error refreshing token:', refreshError.message);
          return { error: 'Failed to refresh access token' };
        }
      } else {
        console.error('Error fetching tracks:', error.response ? error.response.data : error.message);
        return { error: 'Failed to fetch tracks' };
      }
    }
  }

  // If maximum retries reached
  console.error('Max retries reached. Unable to fetch tracks.');
  return { error: 'Failed to fetch tracks after multiple attempts' };
};

const fetchSpotifyTracks = async (accessToken) => {
  let url = 'https://api.spotify.com/v1/me/tracks';
  let allTracks = [];
  let totalFetchedTracks = 0;

  try {
    console.log("Fetching tracks...");
    
    while (url && totalFetchedTracks < MAX_TRACKS) {
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`
        },
        params: {
          limit: Math.min(50, MAX_TRACKS - totalFetchedTracks), // Ensure we don't fetch more than needed
          offset: totalFetchedTracks // Pagination offset
        }
      });

      // Add the current page of tracks to the allTracks array
      const fetchedTracks = response.data.items.map(item => ({
        trackId: item.track.id,
        track: item.track,
        trackName: item.track.name,
        artists: item.track.artists.map(artist => artist.name).join(', '),
        albumName: item.track.album.name,
        albumType: item.track.album.album_type,
        releaseDate: item.track.album.release_date,
        durationMs: item.track.duration_ms,
      }));

      allTracks = allTracks.concat(fetchedTracks);
      totalFetchedTracks += fetchedTracks.length;

      let trackIDs = response.data.items.map(item => item.track.id);
      const serializedTracks = JSON.stringify(trackIDs);
      const { hash } = hashId(response);

      // Update the database with the latest track hash and sync time
      await prisma.spotifyData.updateMany({
        where: {
          username: "Chandragupt Singh"
        },
        data: { 
          last_playlistTrackIds_hash: hash,
          last_SyncedAt: new Date(),
          last_TrackIds: serializedTracks
        }
      });

      // Log track details for the current page
      // console.log('--------------------------------------------');
      // let trackNumber = totalFetchedTracks - fetchedTracks.length + 1;
      // response.data.items.forEach(item => {
      //   console.log(`  TrackNumber: ${trackNumber}`);
      //   console.log(`  TrackID: ${item.track.id}`);
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
    console.log(`Total tracks fetched: ${allTracks.length} tracks.`);
    return allTracks; // Return all the tracks fetched

  } catch (error) {
    console.error('Error fetching tracks:', error.message);
    throw error; // Propagate the error to be handled in `searchSpotifyTracks`
  }
};
