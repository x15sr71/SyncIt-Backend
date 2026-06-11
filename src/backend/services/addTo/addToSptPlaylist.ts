import axios, { AxiosError } from 'axios';
import {
  get_SpotifyAccessToken,
  refreshSpotifyToken,
} from '../../../auth/spotify/spotifyTokenUtil';

const MAX_RETRIES = 5;

/**
 * Add tracks to a Spotify playlist.
 * Returns the Spotify playlist ID that was used (created or found).
 */
export const addToSptPlaylist = async function (
  trackIdsToAdd: string[][],
  userId: string,
  playlistName: string,
  destinationPlaylistId?: string,
): Promise<string | undefined> {
  let retryCount = 0;
  const flatTrackIds = trackIdsToAdd.flat();

  const validTrackIds = flatTrackIds.filter(
    (id) => id && typeof id === 'string' && id.length === 22,
  );

  if (validTrackIds.length === 0) {
    console.error('No valid track IDs provided.');
    return undefined;
  }

  while (retryCount < MAX_RETRIES) {
    try {
      const access_Token = await get_SpotifyAccessToken(userId);

      // Use the provided destination playlist ID directly; only fall back to
      // name-based lookup/creation when no ID is stored yet.
      const playlistId = destinationPlaylistId
        ? destinationPlaylistId
        : await findOrCreatePlaylist(playlistName, access_Token);

      await addToPlaylist(validTrackIds, playlistId, access_Token);
      return playlistId;
    } catch (error) {
      if (error instanceof AxiosError && error.response?.status === 401) {
        await refreshSpotifyToken(userId);
        retryCount++;
        continue;
      }
      console.error('Error adding tracks:', error.response?.data || error.message);
      return undefined;
    }
  }

  return undefined;
};

const addToPlaylist = async (trackIdsToAdd: string[], playlistId: string, access_Token: string) => {
  const response = await axios.post(
    `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
    { uris: trackIdsToAdd.map((id) => `spotify:track:${id}`) },
    {
      headers: {
        Authorization: `Bearer ${access_Token}`,
        'Content-Type': 'application/json',
      },
    },
  );
  console.log('Tracks added to the playlist:', response.data);
};

const findOrCreatePlaylist = async (
  playlistName: string,
  access_Token: string,
): Promise<string> => {
  const existingPlaylistsResponse = await axios.get(
    'https://api.spotify.com/v1/me/playlists?limit=50',
    { headers: { Authorization: `Bearer ${access_Token}` } },
  );

  const existingPlaylist = existingPlaylistsResponse.data.items.find(
    (playlist: any) => playlist.name === playlistName,
  );

  if (existingPlaylist) {
    return existingPlaylist.id;
  }

  return await createPlaylist(playlistName, access_Token);
};

const createPlaylist = async (playlistName: string, access_Token: string): Promise<string> => {
  const userProfile = await axios.get('https://api.spotify.com/v1/me', {
    headers: { Authorization: `Bearer ${access_Token}` },
  });

  const userId = userProfile.data.id;

  const response = await axios.post(
    `https://api.spotify.com/v1/users/${userId}/playlists`,
    { name: playlistName, public: true, description: 'Migrated playlist' },
    {
      headers: {
        Authorization: `Bearer ${access_Token}`,
        'Content-Type': 'application/json',
      },
    },
  );

  return response.data.id;
};
