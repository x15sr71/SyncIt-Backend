import axios from 'axios';
import { get_YoutubeAccessToken, refreshYoutubeAccessToken } from '../../OAuth/tokenManagement/youtubeTokensUtil';

const MAX_RETRIES = 2;

export const getYouTubePlaylistContentHandler = async (req, res) => {
  const userId = req.session?.id;
//   const { playlistId } = req.query;

//   if (!userId || !playlistId) {
//     return res.status(400).json({
//       success: false,
//       error: 'BAD_REQUEST',
//       message: 'User session or playlistId missing.',
//     });
//   }

  let retryCount = 0;
  let accessToken: string | null = await get_YoutubeAccessToken(userId);

  while (retryCount <= MAX_RETRIES) {
    try {
      const response = await axios.get('https://www.googleapis.com/youtube/v3/playlistItems', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        params: {
          part: 'snippet,contentDetails',
          maxResults: 50,
          playlistId: "PLY6KwKMkfULUu2t60pJNEieOi83oXWS9Q",
        },
      });

      const items = response.data.items.map((item) => ({
        videoId: item.contentDetails.videoId,
        title: item.snippet.title,
        channelTitle: item.snippet.videoOwnerChannelTitle,
        publishedAt: item.snippet.publishedAt,
        thumbnail: item.snippet.thumbnails?.default?.url,
      }));

      return res.json({ success: true, data: items });
    } catch (error: any) {
      const status = error?.response?.status;

      if (status === 401 && retryCount < MAX_RETRIES) {
        const newToken = await refreshYoutubeAccessToken(userId);
        if (newToken && typeof newToken === 'string') {
          accessToken = newToken;
          retryCount++;
          continue;
        } else {
          return res.status(401).json({
            success: false,
            error: 'AUTH_REFRESH_FAILED',
            message: 'Failed to refresh token.',
          });
        }
      }

      console.error('YouTube content fetch error:', error?.response?.data || error.message);
      return res.status(500).json({
        success: false,
        error: 'YOUTUBE_CONTENT_FETCH_FAILED',
        message: 'Failed to fetch playlist contents.',
      });
    }
  }
};
