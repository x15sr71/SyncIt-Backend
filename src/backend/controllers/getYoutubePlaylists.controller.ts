// src/api/handlers/getYouTubePlaylistsHandler.ts

import axios from 'axios';
import { get_YoutubeAccessToken, refreshYoutubeAccessToken } from '../../OAuth/tokenManagement/youtubeTokensUtil';

const YOUTUBE_PLAYLISTS_API = 'https://www.googleapis.com/youtube/v3/playlists';
const MAX_RETRIES = 2;

export const getYouTubePlaylistsHandler = async (req, res) => {
  const userId = req.session?.id;

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'User session not found. Please log in.',
    });
  }

  let retryCount = 0;
  let accessToken: string | null = await get_YoutubeAccessToken(userId);

  while (retryCount <= MAX_RETRIES) {
    try {
      const response = await axios.get(YOUTUBE_PLAYLISTS_API, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        params: {
          part: 'snippet,contentDetails',
          mine: true,
          maxResults: 50,
        },
      });

      return res.json({ success: true, data: response.data.items });
    } catch (error: any) {
      const status = error?.response?.status;

      if (status === 401 && retryCount < MAX_RETRIES) {
        console.warn('YouTube token expired. Attempting to refresh...');
        const newAccessToken = await refreshYoutubeAccessToken(userId);
        if (newAccessToken && typeof newAccessToken === 'string') {
          accessToken = newAccessToken;
          retryCount++;
          continue;
        } else {
          return res.status(401).json({
            success: false,
            error: 'AUTH_REFRESH_FAILED',
            message: 'Failed to refresh YouTube token. Please log in again.',
          });
        }
      }

      console.error('YouTube API error:', error?.response?.data || error.message);
      return res.status(500).json({
        success: false,
        error: 'YOUTUBE_API_ERROR',
        message: 'Failed to fetch playlists from YouTube.',
      });
    }
  }
};
