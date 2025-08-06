import { migrateYoutubeToSpotifyService } from "../services/migration/youtubeToSpotify";

export const migrateYoutubeToSpotifyHandler = async (req, res) => {
  const userId = req.session?.id;
  if (!userId) {
    console.warn("[Controller] No session, rejecting request");
    return res.status(401).json({
      error: "AUTH_ERROR",
      message: "User session not found. Please log in again.",
    });
  }

  const { playlistId, playlistName } = req.body;
  if (!playlistId || !playlistName) {
    console.warn("[Controller] Missing YouTube playlist ID or name in request body");
    return res.status(400).json({
      error: "MISSING_PLAYLIST_INFO",
      message: "YouTube playlist ID and name are required for migration.",
    });
  }

  try {
    console.log(`[Controller] Starting migration for user ${userId}, playlistId: ${playlistId}, playlistName: ${playlistName}`);
    const result = await migrateYoutubeToSpotifyService(userId, playlistId, playlistName);
    console.log(`[Controller] Migration successful: added ${result.numberOfTracksAdded} tracks`);
    return res.json(result);

  } catch (err: any) {
    if (err.message === "SPOTIFY_QUOTA_EXCEEDED") {
      console.error("[Controller][Quota] Spotify API quota exceeded");
      return res.status(503).json({
        error: "SPOTIFY_QUOTA_EXCEEDED",
        code: 503,
        message: "Spotify API quota has been exceeded. Please try again later or upgrade your quota.",
      });
    }

    if (err.message === "NO_YOUTUBE_TRACKS") {
      console.warn("[Controller] No tracks to migrate");
      return res.status(400).json({
        error: "NO_TRACKS",
        code: 400,
        message: "No valid tracks found to migrate.",
      });
    }

    console.error("[Controller] Unexpected error during migration:", err);
    return res.status(500).json({
      error: "MIGRATION_FAILED",
      code: 500,
      message: "An unexpected error occurred during migration.",
    });
  }
};
