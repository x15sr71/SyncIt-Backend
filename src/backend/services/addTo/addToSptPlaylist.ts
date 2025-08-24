import axios, { AxiosError } from 'axios';
import { get_SpotifyAccessToken, refreshSpotifyToken } from '../../../auth/spotify/spotifyTokenUtil';

const MAX_RETRIES = 5;

export const addToSptPlaylist = async function (trackIdsToAdd: string[][], userId: string, playlistName: string) {
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
      
      // 🆕 Check if playlist with this name already exists or create new one
      const playlistId = await findOrCreatePlaylist(playlistName, access_Token);
      
      console.log("🚀 Sending these track IDs to Spotify:", validTrackIds);
      await addToPlaylist(validTrackIds, playlistId, access_Token);
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

const addToPlaylist = async (trackIdsToAdd: string[], playlistId: string, access_Token: string) => {
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

    console.log('Tracks added to the playlist:', response.data);
  } catch (error) {
    console.error('Error adding tracks:', error.response?.data || error.message);
    throw error;
  }
};

// 🆕 New function that checks for existing playlist or creates new one
const findOrCreatePlaylist = async (playlistName: string, access_Token: string): Promise<string> => {
  try {
    // First, check if playlist with this name already exists
    const existingPlaylistsResponse = await axios.get(
      'https://api.spotify.com/v1/me/playlists?limit=50',
      {
        headers: {
          Authorization: `Bearer ${access_Token}`,
        },
      }
    );

    const existingPlaylist = existingPlaylistsResponse.data.items.find(
      (playlist: any) => playlist.name === playlistName
    );

    if (existingPlaylist) {
      console.log(`🔄 Found existing playlist '${playlistName}' with ID: ${existingPlaylist.id}`);
      return existingPlaylist.id;
    } else {
      // Create new playlist only if it doesn't exist
      console.log(`📝 Creating new playlist '${playlistName}'`);
      return await createPlaylist(playlistName, access_Token);
    }
  } catch (error) {
    console.error('Error finding or creating playlist:', error.response?.data || error.message);
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

    console.log(`🚀 Created new playlist '${playlistName}' with ID: ${response.data.id}`);
    return response.data.id;
  } catch (error) {
    console.error('Error creating playlist:', error.response?.data || error.message);
    throw error;
  }
};
