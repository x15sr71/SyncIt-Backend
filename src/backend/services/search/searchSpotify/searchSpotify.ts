import axios from 'axios';
import {
  get_SpotifyAccessToken,
  refreshSpotifyToken,
} from '../../../../auth/spotify/spotifyTokenUtil';
import { convertDurationToFormattedString } from '../../../utility/convertDuration';
import { mapWithConcurrency, withRetryAfter } from '../../../utility/upstream';

const MAX_RETRIES = 10; // Maximum retries for failed requests
const SEARCH_CONCURRENCY = 5;
const SPOTIFY_API_URL = 'https://api.spotify.com/v1/search';

// Validate that the tracks array is not empty or invalid
const validateTracks = (tracks: any[]) => {
  if (!tracks || !Array.isArray(tracks) || tracks.length === 0) {
    throw new Error('Invalid or empty tracks array');
  }
};

// Create the search query string for Spotify
const createSearchQuery = ({
  title,
  videoChannelTitle,
}: {
  title: string;
  videoChannelTitle: string;
}) => `${title} ${videoChannelTitle}`.trim();

// Handle errors, refresh token if necessary, and retry if applicable
const handleSearchError = async (error: any, userId: string) => {
  const { response } = error;

  if (!response) {
    console.error('Network error:', error.message);
    return null;
  }

  const { status, data } = response;
  if (status === 401) {
    console.warn('Access token expired. Attempting to refresh...');
    try {
      await refreshSpotifyToken(userId);
      return get_SpotifyAccessToken(userId);
    } catch (refreshError: any) {
      console.error('Failed to refresh token:', refreshError.message);
    }
  } else if (status === 403 && data?.error?.message === 'quotaExceeded') {
    console.error('Quota exceeded. Check your quota or request an increase.');
  } else {
    console.error(`Error: ${data?.error?.message || error.message}`);
  }
  return null;
};

// Perform the search request to Spotify
const performSearch = async (track: any, accessToken: string, userId: string, retryCount = 0) => {
  const searchQuery = createSearchQuery(track);

  if (!searchQuery) {
    console.warn(`Skipping invalid search query for track: ${track.title}`);
    return {
      title: track.title,
      youtubeChannelName: track.videoChannelTitle,
      results: [],
    };
  }

  try {
    const response = await withRetryAfter(() =>
      axios.get(SPOTIFY_API_URL, {
        params: { q: searchQuery, type: 'track', limit: 3 },
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    );
    return {
      title: track.title,
      youtubeChannelName: track.videoChannelTitle,
      results: response.data.tracks.items,
    };
  } catch (error: any) {
    if (retryCount < MAX_RETRIES) {
      const newToken = await handleSearchError(error, userId);
      if (newToken) {
        // ✅ FIXED: correctly pass userId and retryCount
        return performSearch(track, newToken, userId, retryCount + 1);
      }
    }
    return {
      title: track.title,
      youtubeChannelName: track.videoChannelTitle,
      results: [],
    }; // Return empty on failure
  }
};

// Format track search results
const formatResults = (searchResults: any[], trackNumber: number) =>
  searchResults.map((track: any, resultIndex: number) => ({
    id: track.id,
    trackNumber,
    name: track.name,
    artists: track.artists?.map((artist: any) => artist.name).join(', ') || 'Unknown Artist',
    release_date: track.album?.release_date || 'N/A',
    duration: convertDurationToFormattedString(track.duration_ms),
    resultNumber: resultIndex + 1,
  }));

// Main function to search for tracks on Spotify
export const searchTracksOnSpotify = async (
  tracks: any[],
  globalTrackNumber: number,
  userId: string,
) => {
  validateTracks(tracks); // Ensure valid tracks array
  let accessToken = await get_SpotifyAccessToken(userId); // Fetch initial access token

  // Bounded fan-out: firing all searches in parallel guaranteed 429s that
  // were swallowed as "no results" (P2-3).
  return mapWithConcurrency(tracks, SEARCH_CONCURRENCY, async (track, index) => {
    const trackNumber = globalTrackNumber + index;
    try {
      const result = await performSearch(track, accessToken, userId);
      return {
        ...result,
        trackNumber,
        query: createSearchQuery(track),
        results: formatResults(result.results, trackNumber),
      };
    } catch (err: any) {
      console.error(`Spotify search failed for ${track.title}:`, err?.message);
      return {
        title: track.title,
        trackNumber,
        youtubeChannelName: track.videoChannelTitle,
        query: createSearchQuery(track),
        results: [],
      };
    }
  });
};
