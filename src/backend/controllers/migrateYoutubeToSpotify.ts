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

  try {
    console.log(`[Controller] Starting migration for user ${userId}`);
    const result = await migrateYoutubeToSpotifyService(userId);
    console.log(`[Controller] Migration successful: added ${result.numberOfTracksAdded} tracks`);
    return res.json(result);

  } catch (err: any) {
    // Quota hit → send custom code and message
    if (err.message === "YOUTUBE_QUOTA_EXCEEDED") {
      console.error("[Controller][Quota] YouTube API quota exceeded");
      return res.status(503).json({
        error: "YOUTUBE_QUOTA_EXCEEDED",
        message: "YouTube API quota has been exceeded. Please try again later or upgrade your quota.",
      });
    }

    // No tracks found
    if (err.message === "NO_YOUTUBE_TRACKS") {
      console.warn("[Controller] No YouTube tracks to migrate");
      return res.status(400).json({
        error: "NO_YOUTUBE_TRACKS",
        message: "No valid tracks found in your YouTube playlist to migrate.",
      });
    }

    // Catch‐all for other errors
    console.error("[Controller] Unexpected error during migration:", err);
    return res.status(500).json({
      error: "MIGRATION_FAILED",
      message: "An unexpected error occurred during migration.",
    });
  }
};
