import axios, { AxiosError } from 'axios';
import { get_SpotifyAccessToken, refreshSpotifyToken } from '../../OAuth/tokenManagement/spotifyTokenUtil';
import { hashId } from '../../OAuth/utility/encrypt';
import prisma from '../../db';

// Define types for the Spotify API response and tracks
interface SpotifyArtist {
  name: string;
}

interface SpotifyAlbum {
  name: string;
  album_type: string;
  release_date: string;
}

interface SpotifyTrack {
  id: string;
  name: string;
  artists: SpotifyArtist[];
  album: SpotifyAlbum;
  duration_ms: number;
}

interface SpotifyTrackItem {
  track: SpotifyTrack;
}

interface SpotifyTrackResponse {
  items: SpotifyTrackItem[];
  next: string | null;
}

interface RefreshedTokenData {
  access_token: string;
}

let spotifyTrackArray: SpotifyTrack[] = [];
const MAX_RETRIES = 3; // Maximum number of retries
const MAX_TRACKS = 100; // Maximum number of tracks to fetch

export const searchSpotifyTracks = async (): Promise<{ status?: string; data?: SpotifyTrack[]; error?: string }> => {
  let retryCount = 0;
  let accessToken: string | null = null;

  while (retryCount < MAX_RETRIES) {
    try {
      accessToken = await get_SpotifyAccessToken();
      console.log(accessToken);

      // Exit if access token is not found or is invalid
      if (!accessToken) {
        console.error("Access token not found or invalid.");
        return { error: 'Access token not found' };
      }

      const tracks = await fetchSpotifyTracks(accessToken);
      return { status: "success", data: tracks };

    } catch (error) {
      if (error instanceof AxiosError && error.response?.status === 401) {
        console.log("Access token expired, refreshing token...");
        try {
          const refreshedTokenData = await refreshSpotifyToken() as RefreshedTokenData;
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
          console.error('Error refreshing token:', (refreshError as Error).message);
          return { error: 'Failed to refresh access token' };
        }
      } else {
        console.error('Error fetching tracks:', error.response?.data || (error as Error).message);
        return { error: 'Failed to fetch tracks' };
      }
    }
  }

  // If maximum retries reached
  console.error('Max retries reached. Unable to fetch tracks.');
  return { error: 'Failed to fetch tracks after multiple attempts' };
};

const fetchSpotifyTracks = async (accessToken: string): Promise<SpotifyTrack[]> => {
  let url: string | null = 'https://api.spotify.com/v1/me/tracks';
  let allTracks: SpotifyTrack[] = [];
  let totalFetchedTracks = 0;

  try {
    console.log("Fetching tracks...");

    while (url && totalFetchedTracks < MAX_TRACKS) {
      const response = await axios.get<SpotifyTrackResponse>(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        params: {
          limit: Math.min(50, MAX_TRACKS - totalFetchedTracks), // Ensure we don't fetch more than needed
          offset: totalFetchedTracks, // Pagination offset
        },
      });

      // Add the current page of tracks to the allTracks array
      const fetchedTracks: SpotifyTrack[] = response.data.items.map(item => ({
        id: item.track.id,
        name: item.track.name,
        artists: item.track.artists.map(artist => ({ name: artist.name })),
        album: {
          name: item.track.album.name,
          album_type: item.track.album.album_type,
          release_date: item.track.album.release_date,
        },
        duration_ms: item.track.duration_ms,
      }));

      allTracks = allTracks.concat(fetchedTracks);
      totalFetchedTracks += fetchedTracks.length;

      const trackIDs: string[] = response.data.items.map(item => item.track.id);
      const serializedTracks = JSON.stringify(trackIDs);
      const { hash } = hashId(response);

      // Update the database with the latest track hash and sync time
      await prisma.spotifyData.updateMany({
        where: {
          username: "Chandragupt Singh",
        },
        data: {
          last_playlistTrackIds_hash: hash,
          last_SyncedAt: new Date(),
          last_TrackIds: serializedTracks,
        },
      });

      // Check for the next page of results
      url = response.data.next; // The URL for the next page of results, or null if no more pages
    }

    spotifyTrackArray = allTracks;
    console.log(`Total tracks fetched: ${allTracks.length} tracks.`);
    return allTracks; // Return all the tracks fetched

  } catch (error) {
    console.error('Error fetching tracks:', (error as Error).message);
    throw error; // Propagate the error to be handled in `searchSpotifyTracks`
  }
};
