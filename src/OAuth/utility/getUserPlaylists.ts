import axios, { AxiosError } from 'axios';
import { get_YoutubeAccessToken, refreshYoutubeAccessToken } from '../tokenManagement/youtubeTokensUtil';

// Define type for YouTube playlist item
interface YouTubePlaylistItem {
  id: string;
  snippet: {
    title: string;
  };
}

// Define type for the API response
interface YouTubePlaylistsResponse {
  items: YouTubePlaylistItem[];
}

// Define type for the playlist returned by the function
interface Playlist {
  playlistId: string;
  title: string;
}

const MAX_RETRIES = 3; // Set the maximum number of retries

const getUserPlaylists = async (): Promise<Playlist[]> => {
  let retryCount = 0;

  while (retryCount < MAX_RETRIES) {
    try {
      let accessToken: string = await get_YoutubeAccessToken(); // Get the initial access token
      const url = 'https://www.googleapis.com/youtube/v3/playlists';

      const response = await axios.get<YouTubePlaylistsResponse>(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        params: {
          part: 'snippet',
          mine: true, // Retrieve playlists of the authenticated user
          maxResults: 50, // Limit the number of playlists
        },
      });

      const playlists: Playlist[] = response.data.items.map(item => ({
        playlistId: item.id,
        title: item.snippet.title,
      }));

      return playlists;

    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;

        if (axiosError.response && axiosError.response.status === 401) {
          // Access token expired, refresh it and retry
          console.log('Access token expired, refreshing token...');
          await refreshYoutubeAccessToken();
          retryCount += 1;
          console.log(`Retrying... Attempt ${retryCount}/${MAX_RETRIES}`);
          
          // Retry with the new token
          continue;
        }
        
        // Other Axios errors
        console.error('Error fetching playlists:', axiosError.response?.data || axiosError.message);
      } else {
        // Non-Axios errors
        console.error('Unknown error occurred:', error);
      }

      throw error;
    }
  }

  // If the maximum number of retries is reached
  throw new Error('Failed to fetch playlists after multiple attempts');
};

export default getUserPlaylists;
