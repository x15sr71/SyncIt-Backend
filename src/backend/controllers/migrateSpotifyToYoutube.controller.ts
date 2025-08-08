import { Request, Response } from "express";
import axios from "axios";
import { migrateSpotifyPlaylistToYoutube } from "../services/migration/spotifyToYoutube";
import { get_YoutubeAccessToken } from "../../auth/youtube/youtubeTokensUtil";

export async function migrateSpotifyToYoutubeHandler(req, res) {
  const userId = req.session?.id as string;
  const { spotifyPlaylistId, youtubePlaylistId, playlistName } = req.body;

  if (!userId) {
    console.warn("[Controller] No session, rejecting request");
    return res.status(401).json({
      success: false,
      error: "AUTH_ERROR",
      message: "User session not found. Please log in again.",
    });
  }

  if (!spotifyPlaylistId) {
    console.warn("[Controller] Missing Spotify playlist ID in request body");
    return res.status(400).json({
      success: false,
      error: "MISSING_PLAYLIST_INFO",
      message: "Spotify playlist ID is required for migration.",
    });
  }

  try {
    console.log(
      `[Controller] Starting Spotify to YouTube migration for user ${userId}`,
      {
        spotifyPlaylistId,
        youtubePlaylistId,
        playlistName,
      }
    );

    // 🆕 Use smart playlist finding/creation
    const targetPlaylistId = await findOrCreateYouTubePlaylist(
      userId,
      playlistName,
      youtubePlaylistId
    );

    const result = await migrateSpotifyPlaylistToYoutube(
      userId,
      spotifyPlaylistId, // ✅ Correct: Spotify playlist ID
      targetPlaylistId // ✅ Correct: YouTube playlist ID
    );

    console.log(
      `[Controller] Migration successful: added ${result.addedCount} tracks, failed ${result.failedCount}`
    );

    return res.json({
      success: result.success,
      numberOfTracksAdded: result.addedCount,
      successCount: result.addedCount,
      failedTracks: result.failedDetails || [],
      playlistName: playlistName || "Migrated Playlist",
      playlistId: targetPlaylistId,
      done: "done",
    });
  } catch (err: any) {
    console.error(
      "[Controller] Error during Spotify to YouTube migration:",
      err
    );

    // Handle specific error types
    if (err.error === "YOUTUBE_QUOTA_EXCEEDED") {
      return res.status(503).json({
        success: false,
        error: "YOUTUBE_QUOTA_EXCEEDED",
        message: "YouTube API quota has been exceeded. Please try again later.",
      });
    }

    if (err.error === "EMPTY_SPOTIFY_PLAYLIST") {
      return res.status(400).json({
        success: false,
        error: "NO_TRACKS",
        message: "No valid tracks found to migrate.",
      });
    }

    if (err.error === "YOUTUBE_TOKEN_REFRESH_FAILED") {
      return res.status(401).json({
        success: false,
        error: "AUTH_ERROR",
        message:
          "YouTube authentication failed. Please reconnect your YouTube account.",
      });
    }

    if (err.error === "YOUTUBE_PLAYLIST_CREATION_FAILED") {
      return res.status(502).json({
        success: false,
        error: "PLAYLIST_CREATION_FAILED",
        message: "Failed to create YouTube playlist. Please try again.",
      });
    }

    if (err.error === "INVALID_YOUTUBE_PLAYLIST") {
      return res.status(400).json({
        success: false,
        error: "INVALID_YOUTUBE_PLAYLIST",
        message:
          "The specified YouTube playlist doesn't exist or is not accessible.",
      });
    }

    // Generic error response
    return res.status(err.statusCode || 500).json({
      success: false,
      error: "MIGRATION_FAILED",
      message: err.message || "An unexpected error occurred during migration.",
    });
  }
}

// Helper function to create a new YouTube playlist
async function createDefaultYouTubePlaylist(
  userId: string,
  playlistName?: string
): Promise<string> {
  try {
    const accessToken = await get_YoutubeAccessToken(userId);
    const defaultName =
      playlistName ||
      `Imported from Spotify - ${new Date().toLocaleDateString()}`;

    console.log(`[Controller] Creating new YouTube playlist: ${defaultName}`);

    const response = await axios.post(
      "https://www.googleapis.com/youtube/v3/playlists?part=snippet,status",
      {
        snippet: {
          title: defaultName,
          description: "Playlist migrated from Spotify using SyncIt",
        },
        status: {
          privacyStatus: "private", // Change to 'public' if needed
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    const playlistId = response.data.id;
    console.log(
      `[Controller] Created new YouTube playlist: ${playlistId} with name: ${defaultName}`
    );
    return playlistId;
  } catch (error: any) {
    console.error("[Controller] Failed to create YouTube playlist:", error);
    throw {
      success: false,
      error: "YOUTUBE_PLAYLIST_CREATION_FAILED",
      message:
        error?.response?.data?.error?.message ||
        "Failed to create YouTube playlist",
      statusCode: 502,
    };
  }
}

// Helper function to validate YouTube playlist exists and is accessible
async function validateYouTubePlaylist(
  userId: string,
  playlistId: string
): Promise<boolean> {
  try {
    const accessToken = await get_YoutubeAccessToken(userId);

    console.log(`[Controller] Validating YouTube playlist: ${playlistId}`);

    const response = await axios.get(
      `https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=${playlistId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    const isValid = response.data.items && response.data.items.length > 0;
    console.log(`[Controller] Playlist validation result: ${isValid}`);
    return isValid;
  } catch (error: any) {
    console.error("[Controller] Playlist validation failed:", error);
    return false;
  }
}

async function findOrCreateYouTubePlaylist(
  userId: string,
  playlistName: string,
  providedPlaylistId?: string
): Promise<string> {
  const accessToken = await get_YoutubeAccessToken(userId);

  // If playlist ID is provided, validate it exists
  if (providedPlaylistId) {
    const isValid = await validateYouTubePlaylist(userId, providedPlaylistId);
    if (isValid) {
      console.log(
        `🔄 Using existing YouTube playlist with ID: ${providedPlaylistId}`
      );
      return providedPlaylistId;
    }
  }

  // Check if playlist with same name already exists
  try {
    const response = await axios.get(
      "https://www.googleapis.com/youtube/v3/playlists?part=snippet&mine=true&maxResults=50",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    const existingPlaylist = response.data.items.find(
      (playlist: any) => playlist.snippet.title === playlistName
    );

    if (existingPlaylist) {
      console.log(
        `🔄 Found existing YouTube playlist '${playlistName}' with ID: ${existingPlaylist.id}`
      );
      return existingPlaylist.id;
    } else {
      // Create new playlist only if it doesn't exist
      console.log(`📝 Creating new YouTube playlist '${playlistName}'`);
      return await createDefaultYouTubePlaylist(userId, playlistName);
    }
  } catch (error: any) {
    console.error("Error finding or creating YouTube playlist:", error);
    throw {
      success: false,
      error: "YOUTUBE_PLAYLIST_FIND_OR_CREATE_FAILED",
      message: error?.message || "Failed to find or create YouTube playlist",
      statusCode: 502,
    };
  }
}

// Optional: Helper function to get user's existing playlists
export async function getUserYouTubePlaylists(userId: string) {
  try {
    const accessToken = await get_YoutubeAccessToken(userId);

    const response = await axios.get(
      "https://www.googleapis.com/youtube/v3/playlists?part=snippet&mine=true&maxResults=50",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    return response.data.items.map((item: any) => ({
      id: item.id,
      title: item.snippet.title,
      description: item.snippet.description,
    }));
  } catch (error: any) {
    console.error("[Controller] Failed to fetch user playlists:", error);
    throw error;
  }
}
