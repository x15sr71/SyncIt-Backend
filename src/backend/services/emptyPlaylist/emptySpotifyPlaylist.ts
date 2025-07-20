import axios from "axios";
import {
  get_SpotifyAccessToken,
  refreshSpotifyToken,
} from "../../../auth/spotify/spotifyTokenUtil";

const MAX_RETRIES = 3;
const SPOTIFY_API_URL = "https://api.spotify.com/v1/me/tracks";
const DEFAULT_RETRY_DELAY = 1000;
const MAX_TRACKS_TO_PROCESS = 10000; // Prevent memory issues
const REQUEST_TIMEOUT = 30000; // 30 seconds

const handleSpotifyError = async (error: any, retryCount: number, userId: string) => {
  const { response } = error;

  if (!response) {
    console.error("Network error:", error.message);
    return { shouldRetry: false };
  }

  const { status, data, headers } = response;

  if (status === 401 && retryCount < MAX_RETRIES) {
    console.warn("Access token expired. Refreshing...");
    try {
      const refreshResult = await refreshSpotifyToken(userId);
      if (!refreshResult) {
        console.error("Token refresh failed: No result returned");
        return { shouldRetry: false };
      }
      const newToken = refreshResult.access_token;
      if (!newToken) {
        console.error("Token refresh failed: No access token in result");
        return { shouldRetry: false };
      }
      return { shouldRetry: true, newAccessToken: newToken };
    } catch (refreshError) {
      console.error("Token refresh failed:", refreshError.message);
      return { shouldRetry: false };
    }
  } else if (status === 429) {
    const retryAfter = headers["retry-after"]
      ? parseInt(headers["retry-after"], 10) * 1000
      : DEFAULT_RETRY_DELAY;
    console.warn(`Rate limited. Retrying after ${retryAfter} ms...`);
    await new Promise((res) => setTimeout(res, retryAfter));
    return { shouldRetry: true };
  } else if (status === 403 && data?.error?.message === "quotaExceeded") {
    console.error("Quota exceeded. Cannot proceed.");
  } else {
    console.error(
      `Spotify API error (${status}):`,
      data?.error?.message || error.message
    );
  }

  return { shouldRetry: false };
};

const fetchLikedTracks = async (
  accessToken: string,
  userId: string,
  tracks: any[] = [],
  nextUrl: string | null = null
): Promise<any[]> => {
  let currentToken = accessToken;
  let retryCount = 0;

  while (retryCount <= MAX_RETRIES) {
    try {
      const url = nextUrl || SPOTIFY_API_URL;
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${currentToken}` },
        timeout: REQUEST_TIMEOUT,
      });

      tracks.push(...response.data.items);

      // Check for memory limits
      if (tracks.length > MAX_TRACKS_TO_PROCESS) {
        throw new Error(`Too many tracks (${tracks.length}). Consider batch processing.`);
      }

      if (response.data.next) {
        return fetchLikedTracks(currentToken, userId, tracks, response.data.next);
      }

      return tracks;
    } catch (error) {
      if (tracks.length > MAX_TRACKS_TO_PROCESS) {
        throw error; // Don't retry if it's a memory limit error
      }

      const result = await handleSpotifyError(error, retryCount, userId);
      if (!result.shouldRetry || retryCount >= MAX_RETRIES) {
        throw new Error(`Failed to fetch liked tracks: ${error.message}`);
      }
      currentToken = result.newAccessToken || currentToken;
      retryCount++;
    }
  }

  throw new Error("Max retries exceeded while fetching liked tracks");
};

const removeBatch = async (batch: string[], accessToken: string): Promise<void> => {
  const response = await axios.delete(SPOTIFY_API_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { ids: batch },
    timeout: REQUEST_TIMEOUT,
  });

  if (response.status === 200) {
    console.log(`Batch of ${batch.length} tracks removed successfully.`);
  } else {
    console.warn(
      `Unexpected response while removing batch. Status: ${response.status}`
    );
  }
};

const removeTracksFromLiked = async (
  tracks: any[],
  accessToken: string,
  userId: string
): Promise<void> => {
  const BATCH_SIZE = 50;
  const trackIds = tracks.map((item) => item.track.id).filter(id => id); // Filter out null/undefined IDs

  if (trackIds.length === 0) {
    console.log("No valid track IDs found to remove.");
    return;
  }

  let currentToken = accessToken;

  for (let i = 0; i < trackIds.length; i += BATCH_SIZE) {
    const batch = trackIds.slice(i, i + BATCH_SIZE);
    console.log(`Removing batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(trackIds.length / BATCH_SIZE)} (${batch.length} tracks)...`);

    let retryCount = 0;
    
    while (retryCount <= MAX_RETRIES) {
      try {
        await removeBatch(batch, currentToken);
        break; // Success, move to next batch
      } catch (error) {
        const result = await handleSpotifyError(error, retryCount, userId);
        if (!result.shouldRetry || retryCount >= MAX_RETRIES) {
          throw new Error(`Failed to remove batch after ${MAX_RETRIES} retries: ${error.message}`);
        }
        currentToken = result.newAccessToken || currentToken;
        retryCount++;
        console.log(`Retrying batch ${Math.floor(i / BATCH_SIZE) + 1}, attempt ${retryCount + 1}...`);
      }
    }
  }
};

export const clearLikedTracks = async (userId: string) => {
  // Input validation
  if (!userId || typeof userId !== 'string' || userId.trim() === '') {
    throw new Error("Invalid userId provided");
  }

  // Validate environment variables
  if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
    throw new Error("Missing Spotify credentials in environment");
  }

  try {
    let accessToken = await get_SpotifyAccessToken(userId);
    if (!accessToken) {
      throw new Error("Could not retrieve access token");
    }

    console.log("Fetching liked tracks...");
    const tracks = await fetchLikedTracks(accessToken, userId);

    if (tracks.length === 0) {
      console.log("No liked tracks found. Nothing to remove.");
      return {
        success: true,
        message: "No liked tracks found. Nothing to remove.",
        removedCount: 0,
        remainingTracks: [],
      };
    }

    console.log(`Found ${tracks.length} liked tracks. Removing...`);
    await removeTracksFromLiked(tracks, accessToken, userId);

    console.log("Successfully removed all liked tracks.");
    
    // Get fresh token for final verification
    accessToken = await get_SpotifyAccessToken(userId);
    const updatedTracks = await fetchLikedTracks(accessToken, userId);

    return {
      success: true,
      message: `Successfully removed ${tracks.length} liked tracks.`,
      removedCount: tracks.length,
      remainingTracks: updatedTracks,
    };
  } catch (error) {
    console.error("Error in clearLikedTracks:", error.message);
    
    // Provide user-friendly error messages
    if (error.message.includes('token') || error.message.includes('401')) {
      throw new Error("Authentication failed. Please reconnect your Spotify account.");
    } else if (error.message.includes('429') || error.message.includes('rate limit')) {
      throw new Error("Spotify API rate limit exceeded. Please try again later.");
    } else if (error.message.includes('403') || error.message.includes('quota')) {
      throw new Error("Spotify API quota exceeded. Please try again later.");
    }
    
    throw error;
  }
};
