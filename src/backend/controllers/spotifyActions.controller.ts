import axios from 'axios';
import { get_SpotifyAccessToken, refreshSpotifyToken } from '../../auth/spotify/spotifyTokenUtil';

const MAX_RETRIES = 2;

export const renamePlaylistHandler = async (req, res) => {
  console.log('^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^');
  console.log('Renaming Spotify Playlist Handler Invoked');
  console.log('^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^');
  const { playlistId, newName } = req.body;
  const userId = req.session?.id;

  if (!userId || !playlistId || !newName) {
    return res.status(400).json({ success: false, message: 'Missing required parameters.' });
  }

  let retryCount = 0;
  let accessToken = await get_SpotifyAccessToken(userId);

  while (retryCount <= MAX_RETRIES) {
    try {
      await axios.put(
        `https://api.spotify.com/v1/playlists/${playlistId}`,
        { name: newName },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      return res.json({
        success: true,
        message: 'Playlist renamed successfully.',
      });
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 401 && retryCount < MAX_RETRIES) {
        const refreshed = await refreshSpotifyToken(userId);
        if (refreshed?.access_token) {
          accessToken = refreshed.access_token;
          retryCount++;
          continue;
        }
        return res.status(401).json({ success: false, message: 'Token refresh failed.' });
      }
      return res.status(500).json({ success: false, message: 'Failed to rename playlist.' });
    }
  }
};

export const deletePlaylistHandler = async (req, res) => {
  // DELETE /playlists/{id}/followers was removed in the Spotify Feb-2026 dev-mode API update.
  // Spotify does not expose a playlist-delete endpoint; users must unfollow via the Spotify app.
  return res.status(501).json({
    success: false,
    message: 'Playlist deletion is not supported via the Spotify API. Please unfollow the playlist directly in Spotify.',
  });
};

export const deleteSongHandler = async (req, res) => {
  const { playlistId, trackUri } = req.body;
  const userId = req.session?.id;

  if (!userId || !playlistId || !trackUri) {
    return res.status(400).json({ success: false, message: 'Missing parameters.' });
  }

  let retryCount = 0;
  let accessToken = await get_SpotifyAccessToken(userId);

  while (retryCount <= MAX_RETRIES) {
    try {
      await axios.request({
        method: 'DELETE',
        url: `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        data: {
          tracks: [{ uri: trackUri }],
        },
      });

      return res.json({
        success: true,
        message: 'Track removed from playlist.',
      });
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 401 && retryCount < MAX_RETRIES) {
        const refreshed = await refreshSpotifyToken(userId);
        if (refreshed?.access_token) {
          accessToken = refreshed.access_token;
          retryCount++;
          continue;
        }
        return res.status(401).json({ success: false, message: 'Token refresh failed.' });
      }
      return res.status(500).json({ success: false, message: 'Failed to delete song.' });
    }
  }
};
