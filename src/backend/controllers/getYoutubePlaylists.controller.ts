import axios from 'axios';
import { get_YoutubeAccessToken, refreshYoutubeAccessToken } from '../../auth/youtube/youtubeTokensUtil';

const YOUTUBE_PLAYLISTS_API = 'https://www.googleapis.com/youtube/v3/playlists';
const MAX_RETRIES = 3; // Reduced from 10 to be more reasonable
const REQUEST_TIMEOUT = 10000; // 10 seconds

export const getYouTubePlaylistsHandler = async (req, res) => {
  const userId = req.session?.id;

  console.log("^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^")
console.log("YouTube Playlists Route Loaded");
console.log("^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^")

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'User session not found. Please log in.',
    });
  }

  let retryCount = 0;
  let accessToken: string | null = null;

  try {
    accessToken = await get_YoutubeAccessToken(userId);
    if (!accessToken) {
      return res.status(401).json({
        success: false,
        error: 'NO_ACCESS_TOKEN',
        message: 'YouTube access token not found. Please reconnect your account.',
      });
    }
  } catch (error) {
    console.error('Failed to get YouTube access token:', error);
    return res.status(401).json({
      success: false,
      error: 'TOKEN_FETCH_ERROR',
      message: 'Failed to retrieve YouTube access token. Please log in again.',
    });
  }

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
        timeout: REQUEST_TIMEOUT,
      });

      return res.json({ 
        success: true, 
        data: response.data.items || [],
        totalResults: response.data.pageInfo?.totalResults || 0
      });

    } catch (error: any) {
      const status = error?.response?.status;
      const errorData = error?.response?.data;

      if (status === 401 && retryCount < MAX_RETRIES) {
        console.warn(`YouTube token expired. Attempting to refresh... (Attempt ${retryCount + 1})`);
        
        try {
          const refreshResult = await refreshYoutubeAccessToken(userId);
          
          if (refreshResult.success && refreshResult.newAccessToken) {
            accessToken = refreshResult.newAccessToken;
            retryCount++;
            console.log('Token refreshed successfully, retrying request...');
            continue;
          } else {
            // Handle specific refresh errors
            let errorMessage = 'Failed to refresh YouTube token. Please log in again.';
            if (refreshResult.error === 'invalid_grant') {
              errorMessage = 'YouTube refresh token expired. Please reconnect your account.';
            } else if (refreshResult.error === 'no_refresh_token') {
              errorMessage = 'No YouTube refresh token found. Please reconnect your account.';
            }

            return res.status(401).json({
              success: false,
              //temporary error code for clarity
              code: 401,
              error: 'AUTH_REFRESH_FAILED',
              message: errorMessage,
            });
          }
        } catch (refreshError) {
          console.error('Error during token refresh:', refreshError);
          return res.status(401).json({
            success: false,
            //temporary error code for clarity
            code: 401,
            error: 'AUTH_REFRESH_ERROR',
            message: 'An error occurred while refreshing the token. Please log in again.',
          });
        }
      } else if (status === 403) {
        console.error('YouTube API quota exceeded or forbidden:', errorData);
        return res.status(403).json({
          success: false,
          //temporary error code for clarity
          code: 403,
          error: 'QUOTA_EXCEEDED',
          message: 'YouTube API quota exceeded. Please try again later.',
        });
      } else if (status === 429) {
        console.error('YouTube API rate limit exceeded:', errorData);
        return res.status(429).json({
          success: false,
          //temporary error code for clarity
          code: 429,  
          error: 'RATE_LIMIT_EXCEEDED',
          message: 'YouTube API rate limit exceeded. Please try again later.',
        });
      } else {
        console.error('YouTube API error:', errorData || error.message);
        return res.status(500).json({
          success: false,
          //temporary error code for clarity
          code: 500,
          error: 'YOUTUBE_API_ERROR',
          message: 'Failed to fetch playlists from YouTube.',
          details: process.env.NODE_ENV === 'development' ? errorData : undefined,
        });
      }
    }
  }

  // Fallback: all retries exhausted
  return res.status(401).json({
    success: false,
    //temporary error code for clarity
    code: 401,
    error: 'MAX_RETRIES_EXCEEDED',
    message: 'YouTube token expired and could not be refreshed after multiple attempts. Please log in again.',
  });
};
