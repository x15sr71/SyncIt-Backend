import { get_SpotifyAccessToken } from '../../../auth/spotify/spotifyTokenUtil';
import axios from 'axios';

export const createSpotifyPlaylist = async (
  userId: string,
  playlistName: string,
): Promise<string> => {
  const accessToken = await get_SpotifyAccessToken(userId);

  // Feb-2026 API: playlists are created via POST /me/playlists
  // (POST /users/{id}/playlists was removed).
  const playlistRes = await axios.post(
    'https://api.spotify.com/v1/me/playlists',
    {
      name: playlistName,
      description: 'Migrated from YouTube',
      public: true,
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  return playlistRes.data.id;
};
