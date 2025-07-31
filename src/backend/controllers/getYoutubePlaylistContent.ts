import { getYouTubePlaylistContentService } from "../services/getPlaylistContent/getYoutubePlaylistContent";

export const getYouTubePlaylistContentHandler = async (req, res) => {
  const userId = req.session?.id;
  const { playlistIds } = req.body; // Expecting an array of playlist IDs

  if (!userId || !playlistIds || !Array.isArray(playlistIds) || playlistIds.length === 0) {
    return res.status(400).json({
      success: false,
      error: "BAD_REQUEST",
      message: "User session or playlistIds missing.",
    });
  }

  try {
    // Fetch content for each playlist ID concurrently
    const results = await Promise.all(
      playlistIds.map(async (playlistId: string) => {
        const result = await getYouTubePlaylistContentService(userId, playlistId);
        // If successful, include the tracks; if not, return empty array for this playlist
        return {
          playlistId,
          tracks: result.success && result.data ? result.data : [],
        };
      })
    );

    // Build a record mapping each playlistId to its respective tracks array
    const data = results.reduce((acc: Record<string, any[]>, curr) => {
      acc[curr.playlistId] = curr.tracks;
      return acc;
    }, {});

    return res.json({ success: true, data });
  } catch (error: any) {
    return res.status(error.statusCode || 500).json(error);
  }
};
