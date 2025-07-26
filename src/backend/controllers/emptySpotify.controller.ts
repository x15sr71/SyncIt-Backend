import { clearLikedTracks } from "../services/emptyPlaylist/emptySpotifyPlaylist";

export const emptySpotifyPlaylist = async (req, res) => {
  const userId = req.session?.id;

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: "AUTH_ERROR",
      message: "User session not found. Please log in again.",
    });
  }

  try {
    const result = await clearLikedTracks(userId);
    return res.json(result);
  } catch (error) {
    console.error("Error clearing playlist:", error.message);
    const message = error.message || "Unknown error";

    if (message.includes("Authentication failed")) {
      return res.status(401).json({
        success: false,
        code: 401,
        error: "AUTH_ERROR",
        message,
      });
    } else if (message.includes("rate limit")) {
      return res.status(429).json({
        success: false,
        code: 429,
        error: "RATE_LIMIT_EXCEEDED",
        message,
      });
    } else if (message.includes("quota")) {
      return res.status(403).json({
        success: false,
        code: 403,
        error: "QUOTA_EXCEEDED",
        message,
      });
    }

    return res.status(500).json({
      success: false,
      code: 500,
      error: "CLEAR_FAILED",
      message,
    });
  }
};
