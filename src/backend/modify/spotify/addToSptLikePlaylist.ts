import axios, { AxiosError } from 'axios';
import { get_SpotifyAccessToken, refreshSpotifyToken } from '../../../OAuth/tokenManagement/spotifyTokenUtil';
const MAX_RETRIES = 5;

export const addToSptLikePlaylist = async function (trackIdsToAdd) {
  let retryCount = 0;

  while (retryCount < MAX_RETRIES) {
    try {
      console.log(trackIdsToAdd)
      await addToLikePlaylist(trackIdsToAdd);
      return;
    } catch (error) {
      if (error instanceof AxiosError && error.response && error.response.data.code === 401) {
        console.log("Access token expired, refreshing token...");
        await refreshSpotifyToken();
        retryCount++;
        console.log(`Retrying... Attempt ${retryCount}/${MAX_RETRIES}`);
      } else {
        console.log(error);
        return;
      }
    }
  }
}

const addToLikePlaylist = async (trackIdsToAdd) => {
  try {
    const access_Token = await get_SpotifyAccessToken();
    const response = await axios.put(
      'https://api.spotify.com/v1/me/tracks',
      {
        ids: trackIdsToAdd // Use the provided array of track IDs
      },
      {
        headers: {
          Authorization: `Bearer ${access_Token}`,
        }
      }
    );
    console.log('Tracks added to the liked playlist:', response.data);
  } catch (error) {
    console.error('Error adding tracks to the liked playlist:', error.response ? error.response.data : error.message);
    throw error;
  }
};
