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

  try {
    const result = await getYouTubePlaylistContentService(userId, playlistId);
    return res.json(result);
  } catch (error: any) {
    return res.status(error.statusCode || 500).json(error);
  }
};
