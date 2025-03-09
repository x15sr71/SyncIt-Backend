import axios, { AxiosError } from 'axios';
import { get_SpotifyAccessToken, refreshSpotifyToken } from '../../../OAuth/tokenManagement/spotifyTokenUtil';

const MAX_RETRIES = 5;

export const addToSptLikePlaylist = async function (trackIdsToAdd: string[][]) {
  let retryCount = 0;
  const flatTrackIds = trackIdsToAdd.flat(); // ✅ Ensure it's a flat array

  // ✅ Validate track IDs before making the request
  const validTrackIds = flatTrackIds.filter((id) => id && typeof id === 'string' && id.length === 22);

  if (validTrackIds.length === 0) {
    console.error("🛑 No valid track IDs provided.");
    return;
  }

  while (retryCount < MAX_RETRIES) {
    try {
      console.log("🚀 Sending these track IDs to Spotify:", validTrackIds);
      await addToLikePlaylist(validTrackIds);
      return;
    } catch (error) {
      if (error instanceof AxiosError && error.response?.status === 401) {
        console.log("🔄 Access token expired, refreshing...");
        await refreshSpotifyToken();
        retryCount++;
        console.log(`🔁 Retrying... Attempt ${retryCount}/${MAX_RETRIES}`);
      } else {
        console.error("❌ Error adding tracks:", error.response?.data || error.message);
        return;
      }
    }
  }
};

const addToLikePlaylist = async (trackIdsToAdd: string[]) => {
  try {
    const access_Token = await get_SpotifyAccessToken();

    const response = await axios.put(
      'https://api.spotify.com/v1/me/tracks',
      { ids: trackIdsToAdd }, // ✅ Ensure it's an array of valid track IDs
      {
        headers: {
          Authorization: `Bearer ${access_Token}`,
          "Content-Type": "application/json", // ✅ Ensure correct headers
        },
      }
    );

    console.log('✅ Tracks added to the liked playlist:', response.data);
  } catch (error) {
    console.error('❌ Error adding tracks:', error.response?.data || error.message);
    throw error;
  }
};
