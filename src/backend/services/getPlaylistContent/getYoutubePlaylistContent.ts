import axios from 'axios';
import {
  get_YoutubeAccessToken,
  refreshYoutubeAccessToken,
} from '../../../auth/youtube/youtubeTokensUtil';

const MAX_RETRIES = 2;

export const getYouTubePlaylistContentService = async (userId: string, playlistId: string) => {
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
          playlistId,
        },
      });

      const items = response.data.items.map((item) => ({
        videoId: item.contentDetails.videoId,
        title: item.snippet.title,
        channelTitle: item.snippet.videoOwnerChannelTitle,
        publishedAt: item.snippet.publishedAt,
        thumbnail: item.snippet.thumbnails?.default?.url,
      }));

      return { success: true, data: items };
    } catch (error: any) {
      const status = error?.response?.status;

      if (status === 401 && retryCount < MAX_RETRIES) {
        const newToken = await refreshYoutubeAccessToken(userId);
        if (newToken && typeof newToken === 'string') {
          accessToken = newToken;
          retryCount++;
          continue;
        } else {
          return {
            success: false,
            error: 'AUTH_REFRESH_FAILED',
            message: 'Failed to refresh token.',
            statusCode: 401,
          };
        }
      }

      console.error('YouTube content fetch error:', error?.response?.data || error.message);
      return {
        success: false,
        error: 'YOUTUBE_CONTENT_FETCH_FAILED',
        message: 'Failed to fetch playlist contents.',
        statusCode: 500,
      };
    }
  }

  return {
    success: false,
    error: 'MAX_RETRIES_EXCEEDED',
    message: 'Retry limit exceeded while fetching playlist content.',
    statusCode: 500,
  };
};
