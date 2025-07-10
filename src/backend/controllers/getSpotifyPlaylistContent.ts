import axios from 'axios';
import { get_SpotifyAccessToken, refreshSpotifyToken } from '../../OAuth/tokenManagement/spotifyTokenUtil';

const MAX_RETRIES = 2;

export const getSpotifyPlaylistContentHandler = async (req, res) => {
  const userId = req.session?.id;
//   const { playlistId } = req.query;

//   if (!userId || "7GseYEIqIcQLefAIaNxmON") {
//     return res.status(400).json({
//       success: false,
//       error: 'BAD_REQUEST',
//       message: 'User session or playlistId missing.',
//     });
//   }

  let retryCount = 0;
  let accessToken: string | null = await get_SpotifyAccessToken(userId);

  while (retryCount <= MAX_RETRIES) {
    try {
      const response = await axios.get(`https://api.spotify.com/v1/playlists/7GseYEIqIcQLefAIaNxmON/tracks`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        params: {
          limit: 100, // You can paginate further later
        },
      });

      const items = response.data.items.map((item) => ({
        id: item.track.id,
        name: item.track.name,
        artists: item.track.artists.map((a) => a.name),
        album: item.track.album.name,
        duration_ms: item.track.duration_ms,
      }));

      return res.json({ success: true, data: items });
    } catch (error: any) {
      const status = error?.response?.status;

      if (status === 401 && retryCount < MAX_RETRIES) {
        const newToken = await refreshSpotifyToken(userId);
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

      console.error('Spotify content fetch error:', error?.response?.data || error.message);
      return res.status(500).json({
        success: false,
        error: 'SPOTIFY_CONTENT_FETCH_FAILED',
        message: 'Failed to fetch playlist contents.',
      });
    }
  }
};
