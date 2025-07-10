// src/controllers/spotify.controller.ts
import axios from "axios";
import { get_SpotifyAccessToken, refreshSpotifyToken } from "../../../src/OAuth/tokenManagement/spotifyTokenUtil";

const MAX_RETRIES = 3;
const SPOTIFY_API_URL = "https://api.spotify.com/v1/me/tracks";
const DEFAULT_RETRY_DELAY = 1000;

const handleSpotifyError = async (error, retryCount, userId) => {
  const { response } = error;

  if (!response) {
    console.error("Network error:", error.message);
    return { shouldRetry: false };
  }

  const { status, data, headers } = response;

  if (status === 401 && retryCount < MAX_RETRIES) {
    console.warn("Access token expired. Refreshing...");
    try {
      await refreshSpotifyToken(userId);
      const newToken = await get_SpotifyAccessToken(userId);
      return { shouldRetry: true, newAccessToken: newToken };
    } catch (refreshError) {
      console.error("Token refresh failed:", refreshError.message);
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
  accessToken,
  tracks = [],
  nextUrl = null
) => {
  try {
    const url = nextUrl || SPOTIFY_API_URL;
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    tracks.push(...response.data.items);

    if (response.data.next) {
      return fetchLikedTracks(accessToken, tracks, response.data.next);
    }

    return tracks;
  } catch (error) {
    throw new Error(`Failed to fetch liked tracks: ${error.message}`);
  }
};

const removeTracksFromLiked = async (
  tracks,
  accessToken,
  userId,
  retryCount = 0
) => {
  const BATCH_SIZE = 50;
  const trackIds = tracks.map((item) => item.track.id);

  for (let i = 0; i < trackIds.length; i += BATCH_SIZE) {
    const batch = trackIds.slice(i, i + BATCH_SIZE);
    console.log(`Removing batch of ${batch.length} tracks...`);

    try {
      const response = await axios.delete(SPOTIFY_API_URL, {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: { ids: batch },
      });

      if (response.status === 200) {
        console.log(`Batch of ${batch.length} tracks removed successfully.`);
      } else {
        console.warn(
          `Unexpected response while removing batch. Status: ${response.status}`
        );
      }
    } catch (error) {
      const { shouldRetry, newAccessToken } = await handleSpotifyError(
        error,
        retryCount,
        userId
      );

      if (shouldRetry) {
        const tokenToUse = newAccessToken || accessToken;
        await removeTracksFromLiked(tracks, tokenToUse, userId, retryCount + 1);
        return;
      }

      throw new Error(`Failed to remove tracks after retry: ${error.message}`);
    }
  }
};

export const emptySpotifyPlaylist = async (req, res) => {
  const userId = req.session?.id;
  if (!userId) {
    console.error("User ID not found in session.");
    return res.status(401).json({
      success: false,
      error: "AUTH_ERROR",
      message: "User session not found. Please log in again.",
    });
  }

  let accessToken = await get_SpotifyAccessToken(userId);

  try {
    console.log("Fetching liked tracks...");
    const tracks = await fetchLikedTracks(accessToken);

    if (tracks.length === 0) {
      console.log("No liked tracks found.");
      return res.json({
        success: true,
        message: "No liked tracks found. Nothing to remove.",
        remainingTracks: [],
      });
    }

    console.log(`Found ${tracks.length} liked tracks. Removing...`);
    await removeTracksFromLiked(tracks, accessToken, userId);
    console.log("Successfully removed all liked tracks.");

    const updatedTracks = await fetchLikedTracks(accessToken);

    return res.json({
      success: true,
      message: `Successfully removed ${tracks.length} liked tracks.`,
      remainingTracks: updatedTracks,
    });
  } catch (error) {
    console.error("Error during playlist clearing:", error.message);
    return res.status(500).json({
      success: false,
      error: "CLEAR_FAILED",
      message: error.message,
    });
  }
};
