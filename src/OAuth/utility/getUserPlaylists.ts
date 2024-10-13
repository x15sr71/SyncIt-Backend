import axios, { AxiosError } from 'axios';
import { get_YoutubeAccessToken, refreshYoutubeAccessToken } from '../tokenManagement/youtubeTokensUtil';

// Type for a single playlist item
interface Playlist {
  playlistId: string;
  title: string;
}

// Type for the YouTube API response structure
interface YoutubePlaylistResponse {
  items: {
    id: string;
    snippet: {
      title: string;
    };
  }[];
}

// Define a function to get user playlists with proper type annotations
const MAX_RETRIES = 3; // Set the maximum number of retries

const getUserPlaylists = async (): Promise<Playlist[]> => {
  let retryCount = 0;

  while (retryCount < MAX_RETRIES) {
    try {
      let accessToken: string | null = await get_YoutubeAccessToken(); // Get the initial access token

      if (!accessToken) {
        throw new Error('Access token not available');
      }

      const url = 'https://www.googleapis.com/youtube/v3/playlists';

      // Axios response type should be defined based on the YouTube API structure
      const response = await axios.get<YoutubePlaylistResponse>(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`
        },
        params: {
          part: 'snippet',
          mine: true, // Retrieve playlists of the authenticated user
          maxResults: 50 // Limit the number of playlists
        }
      });

      const playlists: Playlist[] = response.data.items.map(item => ({
        playlistId: item.id,
        title: item.snippet.title
      }));

      return playlists;

    } catch (error) {
      if (error instanceof AxiosError && error.response && error.response.status === 401) {
        // Access token expired, refresh it and retry
        console.log('Access token expired, refreshing token...');
        await refreshYoutubeAccessToken();
        retryCount += 1;
        console.log(`Retrying... Attempt ${retryCount}/${MAX_RETRIES}`);
        
        // Retry with the new token
        continue;
      } else {
        // Other errors, log and throw
        console.error('Error fetching playlists:', error instanceof AxiosError ? error.response?.data : error.message);
        throw error;
      }
    }
  }

  // If the maximum number of retries is reached
  throw new Error('Failed to fetch playlists after multiple attempts');
};

export default getUserPlaylists;
