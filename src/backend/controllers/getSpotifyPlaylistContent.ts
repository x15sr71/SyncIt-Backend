import { getSpotifyPlaylistContent } from "../services/getPlaylistContent/getSpotifyPlaylistContent";

export const getSpotifyPlaylistContentHandler = async (req, res) => {
  const userId = req.session?.id;
  const { playlistIds } = req.body; // read playlistIds from POST body

  if (!userId || !Array.isArray(playlistIds) || playlistIds.length === 0) {
    return res.status(400).json({
      success: false,
      error: "BAD_REQUEST",
      message: "User session or playlistIds missing or invalid.",
    });
  }

  try {
    // Fetch all playlists in parallel if getSpotifyPlaylistContent expects a single ID
    const tracksArray = await Promise.all(
      playlistIds.map((id) => getSpotifyPlaylistContent(userId, id))
    );

    // Flatten if each call returns an array of tracks
    const tracks = tracksArray.flat();

    console.log("Received playlistIds:", playlistIds);
    return res.json({ success: true, data: tracks });
  } catch (err) {
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
