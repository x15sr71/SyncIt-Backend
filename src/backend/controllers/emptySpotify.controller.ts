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
    return res.status(500).json({
      success: false,
      error: "CLEAR_FAILED",
      message: error.message,
    });
  }
};
