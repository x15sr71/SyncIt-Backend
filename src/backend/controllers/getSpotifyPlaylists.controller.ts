import axios from 'axios';
import { get_SpotifyAccessToken, refreshSpotifyToken } from '../../OAuth/tokenManagement/spotifyTokenUtil';

const SPOTIFY_PLAYLISTS_API = 'https://api.spotify.com/v1/me/playlists';
const MAX_RETRIES = 2;

export const getPlaylistsHandler = async (req, res) => {
  const userId = req.session?.id;
  console.log("%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%")
  console.log(req.session)
  console.log("%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%")

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'User session not found. Please log in.',
    });
  }

  let retryCount = 0;
  let accessToken: string | null = await get_SpotifyAccessToken(userId);

  while (retryCount <= MAX_RETRIES) {
    try {
      const response = await axios.get(SPOTIFY_PLAYLISTS_API, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        params: {
          limit: 50, // You can paginate further if needed
        },
      });

      return res.json({ success: true, data: response.data.items });
    } catch (error: any) {
      const status = error?.response?.status;

      if (status === 401 && retryCount < MAX_RETRIES) {
        console.warn('Access token expired. Attempting to refresh...');
        const newAccessToken = await refreshSpotifyToken(userId);
        if (newAccessToken && typeof newAccessToken === 'string') {
          accessToken = newAccessToken;
          retryCount++;
          continue;
        } else {
          return res.status(401).json({
            success: false,
            error: 'AUTH_REFRESH_FAILED',
            message: 'Failed to refresh token. Please log in again.',
          });
        }
      }

      console.error('Spotify API error:', error?.response?.data || error.message);
      return res.status(500).json({
        success: false,
        error: 'SPOTIFY_API_ERROR',
        message: 'Failed to fetch playlists from Spotify.',
      });
    }
  }
};
