import axios, { AxiosResponse } from "axios";
import { get_YoutubeAccessToken } from "../../OAuth/tokenManagement/youtubeTokensUtil";

// Define types for YouTube API responses
interface Playlist {
  id: string;
  snippet: {
    title: string;
    description: string;
    thumbnails: {
      default: { url: string };
    };
  };
  status: {
    privacyStatus: string;
  };
  contentDetails: {
    itemCount: number;
  };
}

interface PlaylistItem {
  id: string;
  snippet: {
    title: string;
    resourceId: {
      videoId: string;
    };
  };
}

interface PlaylistsResponse {
  items: Playlist[];
  pageInfo: {
    totalResults: number;
    resultsPerPage: number;
  };
}

interface PlaylistItemsResponse {
  items: PlaylistItem[];
  pageInfo: {
    totalResults: number;
    resultsPerPage: number;
  };
}

// Function to create a YouTube playlist
async function create_YoutubePlaylist(title: string, description: string): Promise<void> {
  const access_Token = await get_YoutubeAccessToken();

  try {
    const response: AxiosResponse<Playlist> = await axios.post(
      'https://www.googleapis.com/youtube/v3/playlists',
      {
        snippet: {
          title: title,
          description: description,
        },
        status: {
          privacyStatus: 'public',
        },
      },
      {
        headers: {
          Authorization: `Bearer ${access_Token}`,
          'Content-Type': 'application/json',
        },
        params: {
          part: 'snippet,status', // Include the parts you're modifying
        },
      }
    );
    console.log(response.data);
  } catch (error: any) {
    console.log('Error in creating YouTube Playlist', error.response ? error.response.data : error.message);
    throw error;
  }
}

// Function to fetch user's YouTube playlists
async function get_YoutubePlaylists(): Promise<void> {
  const access_Token = await get_YoutubeAccessToken();

  try {
    const response: AxiosResponse<PlaylistsResponse> = await axios.get(
      'https://www.googleapis.com/youtube/v3/playlists',
      {
        headers: {
          Authorization: `Bearer ${access_Token}`,
        },
        params: {
          part: 'snippet,contentDetails',
          mine: true,
          maxResults: 25,
        },
      }
    );
    console.log(response.data);
  } catch (error: any) {
    console.log("Error in fetching YouTube Playlists", error.response ? error.response.data : error.message);
    throw error;
  }
}

// Function to fetch items in a YouTube playlist
async function get_YoutubePlaylistItems(playlistId: string): Promise<void> {
  const youtubeAPI_KEY = process.env.YOUTUBE_API_KEY;
  const access_Token = await get_YoutubeAccessToken();

  try {
    const response: AxiosResponse<PlaylistItemsResponse> = await axios.get(
      'https://www.googleapis.com/youtube/v3/playlistItems',
      {
        headers: {
          Authorization: `Bearer ${access_Token}`,
        },
        params: {
          part: 'snippet',
          playlistId: playlistId,
          key: youtubeAPI_KEY,
          maxResults: 50,
        },
      }
    );
    console.log(response.data);
  } catch (error: any) {
    console.log('Error while fetching YouTube Playlist Items', error.response ? error.response.data : error.message);
  }
}
