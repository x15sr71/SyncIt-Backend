import axios, { AxiosError } from 'axios';
import { get_SpotifyAccessToken, refreshSpotifyToken } from '../../../auth/spotify/spotifyTokenUtil';

const MAX_RETRIES = 5;

export const addToSptLikePlaylist = async function (trackIdsToAdd: string[][], userId: string, playlistName: string) {

  console.log(trackIdsToAdd);

  let retryCount = 0;
  const flatTrackIds = trackIdsToAdd.flat(); // Ensure it's a flat array

  const validTrackIds = flatTrackIds.filter((id) => id && typeof id === 'string' && id.length === 22);

  if (validTrackIds.length === 0) {
    console.error("No valid track IDs provided.");
    return;
  }

  while (retryCount < MAX_RETRIES) {
    try {
      const access_Token = await get_SpotifyAccessToken(userId);
      const playlistId = await createPlaylist(playlistName, access_Token);
      console.log(`🚀 Created playlist '${playlistName}' with ID: ${playlistId}`);
      console.log("🚀 Sending these track IDs to Spotify:", validTrackIds);
      await addToLikePlaylist(validTrackIds, playlistId, access_Token);
      return;
    } catch (error) {
      if (error instanceof AxiosError && error.response?.status === 401) {
        console.log("Access token expired, refreshing...");
        await refreshSpotifyToken(userId);
        retryCount++;
        console.log(`Retrying... Attempt ${retryCount}/${MAX_RETRIES}`);
      } else {
        console.error("Error adding tracks:", error.response?.data || error.message);
        return;
      }
    }
  }
};

const addToLikePlaylist = async (trackIdsToAdd: string[], playlistId: string, access_Token: string) => {
  try {
    const response = await axios.post(
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
      {
        uris: trackIdsToAdd.map((id) => `spotify:track:${id}`),
      },
      {
        headers: {
          Authorization: `Bearer ${access_Token}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log('Tracks added to the new playlist:', response.data);
  } catch (error) {
    console.error('Error adding tracks:', error.response?.data || error.message);
    throw error;
  }
};

const createPlaylist = async (playlistName: string, access_Token: string): Promise<string> => {
  try {
    const userProfile = await axios.get("https://api.spotify.com/v1/me", {
      headers: {
        Authorization: `Bearer ${access_Token}`,
      },
    });

    const userId = userProfile.data.id;

    const response = await axios.post(
      `https://api.spotify.com/v1/users/${userId}/playlists`,
      {
        name: playlistName,
        public: true, // ✅ Playlist is now public
        description: "Migrated playlist",
      },
      {
        headers: {
          Authorization: `Bearer ${access_Token}`,
          "Content-Type": "application/json",
        },
      }
    );

    return response.data.id;
  } catch (error) {
    console.error('Error creating playlist:', error.response?.data || error.message);
    throw error;
  }
};
