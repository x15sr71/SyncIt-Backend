import { getSpotifyPlaylistContent } from "../services/getPlaylistContent/getSpotifyPlaylistContent";

export const getSpotifyPlaylistContentHandler = async (req, res) => {
  const userId = req.session?.id;
  // const { playlistId } = req.query as { playlistId?: string };

  if (!userId) {
    return res.status(400).json({
      success: false,
      error: "BAD_REQUEST",
      message: "User session or playlistId missing.",
    });
  }

  try {
    const tracks = await getSpotifyPlaylistContent(
      userId,
      "0QmChKbZIAl4P0P1sTSbF2"
    );
    return res.json({ success: true, data: tracks });
  } catch (err: any) {
    console.error("Spotify content fetch error:", err.response?.data || err);

    const status = err.response?.status;
    const errorMessage = err.message || "Unknown error occurred";

    if (
      status === 401 ||
      errorMessage.includes("refresh Spotify access token")
    ) {
      return res.status(401).json({
        success: false,
        code: 401,
        error: "AUTH_REFRESH_FAILED",
        message: "Failed to refresh token. Please log in again.",
      });
    }

    if (status === 429) {
      return res.status(429).json({
        success: false,
        code: 429,
        error: "RATE_LIMIT_EXCEEDED",
        message: "Rate limit exceeded. Please try again later.",
      });
    }

    return res.status(500).json({
      success: false,
      code: 500,
      error: "SPOTIFY_CONTENT_FETCH_FAILED",
      message: errorMessage,
    });
  }
};
