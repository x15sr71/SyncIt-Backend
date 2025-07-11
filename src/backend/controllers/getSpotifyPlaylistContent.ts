import { getSpotifyPlaylistContent } from "../services/getPlaylistContent/getSpotifyPlaylistContent";

export const getSpotifyPlaylistContentHandler = async (req, res) => {
  const userId = req.session?.id;
  // const { playlistId } = req.query as { playlistId?: string };

  // if (!userId || !playlistId) {
  //   return res.status(400).json({
  //     success: false,
  //     error: "BAD_REQUEST",
  //     message: "User session or playlistId missing.",
  //   });
  // }

  try {
    const tracks = await getSpotifyPlaylistContent(userId, "0QmChKbZIAl4P0P1sTSbF2");
    return res.json({ success: true, data: tracks });
  } catch (err: any) {
    console.error("Spotify content fetch error:", err.response?.data || err);
    const status = err.response?.status;
    if (status === 401) {
      return res.status(401).json({
        success: false,
        error: "AUTH_REFRESH_FAILED",
        message: "Failed to refresh token.",
      });
    }
    return res.status(500).json({
      success: false,
      error: "SPOTIFY_CONTENT_FETCH_FAILED",
      message: "Failed to fetch playlist contents.",
    });
  }
};
