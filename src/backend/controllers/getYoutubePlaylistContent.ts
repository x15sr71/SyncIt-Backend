import { getYouTubePlaylistContentService } from '../services/getPlaylistContent/getYoutubePlaylistContent';

export const getYouTubePlaylistContentHandler = async (req, res) => {
  const userId = req.session?.id;
  const playlistId = req.query?.playlistId || "PLY6KwKMkfULUu2t60pJNEieOi83oXWS9Q"; // fallback

  if (!userId || !playlistId) {
    return res.status(400).json({
      success: false,
      error: 'BAD_REQUEST',
      message: 'User session or playlistId missing.',
    });
  }

  const result = await getYouTubePlaylistContentService(userId, playlistId);

  if (!result.success) {
    return res.status(result.statusCode || 500).json(result);
  }

  return res.json(result);
};
