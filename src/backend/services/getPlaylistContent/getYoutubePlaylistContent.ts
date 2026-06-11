import axios from 'axios';
import {
  get_YoutubeAccessToken,
  refreshYoutubeAccessToken,
} from '../../../auth/youtube/youtubeTokensUtil';
import iso8601Duration from 'iso8601-duration';

const MAX_RETRIES = 2;
const PAGE_SIZE = 50;

export const getYouTubePlaylistContentService = async (userId: string, playlistId: string) => {
  let accessToken = await get_YoutubeAccessToken(userId);
  let retryCount = 0;

  while (retryCount <= MAX_RETRIES) {
    try {
      // Paginate through all playlist items
      const rawItems: any[] = [];
      let pageToken: string | undefined;

      do {
        const response = await axios.get(
          'https://www.googleapis.com/youtube/v3/playlistItems',
          {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: {
              part: 'snippet,contentDetails',
              maxResults: PAGE_SIZE,
              playlistId,
              ...(pageToken ? { pageToken } : {}),
            },
          },
        );
        rawItems.push(...response.data.items);
        pageToken = response.data.nextPageToken;
      } while (pageToken);

      const videoIdsArray = rawItems.map((item) => item.contentDetails.videoId).filter(Boolean);

      const itemsWithoutDuration = rawItems.map((item: any) => ({
        videoId: item.contentDetails.videoId,
        title: item.snippet.title,
        channelTitle: item.snippet.videoOwnerChannelTitle,
        publishedAt: item.snippet.publishedAt,
        thumbnail: item.snippet.thumbnails?.default?.url,
      }));

      // Fetch durations in batches of 50 (API limit per request)
      try {
        const durationMap: Record<string, string> = {};
        for (let i = 0; i < videoIdsArray.length; i += PAGE_SIZE) {
          const batch = videoIdsArray.slice(i, i + PAGE_SIZE);
          const videoDetailsRes = await axios.get(
            'https://www.googleapis.com/youtube/v3/videos',
            {
              headers: { Authorization: `Bearer ${accessToken}` },
              params: { part: 'contentDetails', id: batch.join(',') },
            },
          );
          for (const video of videoDetailsRes.data.items) {
            const parsed = iso8601Duration.parse(video.contentDetails.duration);
            const minutes = parsed.minutes || 0;
            const seconds = parsed.seconds || 0;
            durationMap[video.id] = `${minutes}:${seconds.toString().padStart(2, '0')}`;
          }
        }

        const itemsWithDuration = itemsWithoutDuration.map((item) => ({
          ...item,
          duration: durationMap[item.videoId] || '0:00',
        }));

        return { success: true, data: itemsWithDuration };
      } catch {
        return { success: true, data: itemsWithoutDuration };
      }
    } catch (error: any) {
      const status = error?.response?.status;

      if (status === 401 && retryCount < MAX_RETRIES) {
        const newToken = await refreshYoutubeAccessToken(userId);
        if (newToken.success && typeof newToken.newAccessToken === 'string') {
          accessToken = newToken.newAccessToken;
          retryCount++;
          continue;
        }
        throw {
          success: false,
          error: 'AUTH_REFRESH_FAILED',
          message: 'Failed to refresh token.',
          statusCode: 401,
        };
      }

      console.error('YouTube content fetch error:', error?.response?.data || error.message);
      throw {
        success: false,
        error: 'YOUTUBE_CONTENT_FETCH_FAILED',
        message: 'Failed to fetch playlist contents.',
        statusCode: 500,
      };
    }
  }

  throw {
    success: false,
    error: 'MAX_RETRIES_EXCEEDED',
    message: 'Retry limit exceeded while fetching playlist content.',
    statusCode: 500,
  };
};
