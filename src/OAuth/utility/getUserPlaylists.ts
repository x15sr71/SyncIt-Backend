import axios from 'axios';
import { get_YoutubeAccessToken, refreshYoutubeAccessToken } from '../tokenManagement/youtubeTokensUtil';

const MAX_RETRIES = 3; // Set the maximum number of retries

const getUserPlaylists = async () => {
  let retryCount = 0;

  while (retryCount < MAX_RETRIES) {
    try {
      let accessToken = await get_YoutubeAccessToken(); // Get the initial access token
      const url = 'https://www.googleapis.com/youtube/v3/playlists';

      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`
        },
        params: {
          part: 'snippet',
          mine: true, // Retrieve playlists of the authenticated user
          maxResults: 50 // Limit the number of playlists
        }
      });

      const playlists = response.data.items.map(item => ({
        playlistId: item.id,
        title: item.snippet.title
      }));

      console.log('User Playlists:', playlists);
      return playlists;

    } catch (error) {
      if (error.response && error.response.status === 401) {
        // Access token expired, refresh it and retry
        console.log('Access token expired, refreshing token...');
        await refreshYoutubeAccessToken();
        retryCount += 1;
        console.log(`Retrying... Attempt ${retryCount}/${MAX_RETRIES}`);
        
        // Retry with the new token
        continue;
      } else {
        // Other errors, log and throw
        console.error('Error fetching playlists:', error.response ? error.response.data : error.message);
        throw error;
      }
    }
  }

  // If the maximum number of retries is reached
  throw new Error('Failed to fetch playlists after multiple attempts');
};

export default getUserPlaylists
