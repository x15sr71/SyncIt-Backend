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

export const searchSpotifyTracks = async (req, res): Promise<void> => {
  let retryCount = 0;
  let accessToken: string | null = null;
  const userId = req.session.id;

  while (retryCount < MAX_RETRIES) {
    try {
      accessToken = await get_SpotifyAccessToken(userId);
      console.log("Initial access token:", accessToken);

      // Exit if access token is not found or is invalid
      if (!accessToken) {
        console.error("Access token not found or invalid.");
        res.json({ "error": "AUTH_ERROR", "message": "Access token not found or expired. Please log in again." });
        return;
      }

      const tracks = await fetchSpotifyTracks(accessToken);
      console.log("Fetched tracks:", tracks);
      res.json({ status: "success", data: tracks });
      return;

    } catch (error) {
      if (error instanceof AxiosError && error.response?.status === 401) {
        console.warn("Access token expired. Attempting to refresh...");

        try {
          const refreshedTokenData = await refreshSpotifyToken(userId) as RefreshedTokenData;

          if (refreshedTokenData && refreshedTokenData.access_token) {
            accessToken = refreshedTokenData.access_token;
            retryCount += 1;
            console.log(`Token refreshed. Retrying fetch... Attempt ${retryCount}/${MAX_RETRIES}`);
            continue; // retry with new token
          } else {
            console.error("Failed to refresh access token.");
            res.json({ error: "Failed to refresh access token" });
            return;
          }

        } catch (refreshError) {
          console.error('Error refreshing token:', (refreshError as Error).message);
          res.json({ error: 'Failed to refresh access token' });
          return;
        }

      } else {
        console.error('Error fetching tracks:', error instanceof AxiosError ? error.response?.data : (error as Error).message);
        res.json({ error: 'Failed to fetch tracks' });
        return;
      }
    }
  }

  // If retries exhausted
  console.error("Exceeded max retries while trying to fetch Spotify tracks.");
  res.json({ error: "Exceeded max retries while trying to fetch Spotify tracks." });
}


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
