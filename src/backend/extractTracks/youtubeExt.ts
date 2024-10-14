import axios, { AxiosError, AxiosResponse } from 'axios';
import { get_YoutubeAccessToken, refreshYoutubeAccessToken } from '../../OAuth/tokenManagement/youtubeTokensUtil'; 

const youtube_Api_Key = process.env.YOUTUBE_API_KEY as string; // Ensure the API key is a string

interface PlaylistItem {
  snippet: {
    title: string;
    description: string;
    resourceId: {
      videoId: string;
    };
    publishedAt: string;
    videoOwnerChannelTitle: string;
  };
}

interface VideoDetailItem {
  id: string;
  contentDetails: {
    duration: string;
  };
}

interface YoutubeTrack {
  trackNumber: number;
  title: string;
  description: string;
  videoChannelTitle: string;
  duration: string | null;
  publishedDate: string;
}

interface YoutubeTrackResult {
  success: boolean;
  data?: YoutubeTrack[];
  error?: string;
}

let youtubeTrackArray: YoutubeTrack[] = [];

const MAX_RETRIES = 10; 
const MAX_TRACKS = 50; 

// Function to convert ISO 8601 duration to minutes and seconds
const convertDurationToMinutesAndSeconds = (duration: string): string => {
  const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
  const hours = parseInt(match?.[1] || '0');
  const minutes = parseInt(match?.[2] || '0');
  const seconds = parseInt(match?.[3] || '0');

  const totalMinutes = hours * 60 + minutes;
  return `${totalMinutes}:${String(seconds).padStart(2, '0')}`;
};

export const searchYoutubeTracks = async (): Promise<YoutubeTrackResult> => {
  let retryCount = 0;

  while (retryCount < MAX_RETRIES) {
    try {
      const accessToken = await get_YoutubeAccessToken();
      const fetchedTracks = await fetchYoutubeTracks(accessToken);

      return { success: true, data: fetchedTracks };

    } catch (error) {
      if (error instanceof Error && error.message === 'Access token not found') {
        console.error("Access token not found, cannot proceed.");
        return { success: false, error: 'Access token not found' };
      }

      if (error instanceof AxiosError && error.response?.status === 401) {
        console.log("Access token expired, refreshing token...");
        const refreshSuccess = await refreshYoutubeAccessToken();
        if (refreshSuccess) {
          retryCount += 1;
          console.log(`Retrying... Attempt ${retryCount}/${MAX_RETRIES}`);

          if (retryCount < MAX_RETRIES) {
            console.log("Retrying fetchYoutubeTracks...");
            continue;
          } else {
            console.error('Max retries reached. Unable to fetch tracks.');
            return { success: false, error: 'Max retries reached' };
          }
        } else {
          console.error('Error refreshing token');
          return { success: false, error: 'Failed to refresh YouTube access token' };
        }
      } else {
        console.error('Error fetching tracks:', error instanceof AxiosError ? error.response?.data : error.message);
        return { success: false, error: 'Failed to fetch tracks' };
      }
    }
  }

  return { success: false, error: 'Failed to fetch tracks after retries' };
};

const fetchYoutubeTracks = async (accessToken: string): Promise<YoutubeTrack[]> => {
  let url = 'https://www.googleapis.com/youtube/v3/playlistItems';
  let allTracks: YoutubeTrack[] = [];
  let pageToken = '';
  let trackCounter = 1;
  let totalTracksFetched = 0;

  try {
    while (url && totalTracksFetched < MAX_TRACKS) {
      const response: AxiosResponse<{ items: PlaylistItem[]; nextPageToken?: string }> = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`
        },
        params: {
          part: 'snippet',
          playlistId: 'PLY6KwKMkfULVfUn8i6MQP9i6XqKYdG-LK',
          maxResults: 50,
          pageToken: pageToken
        }
      });

      const videoIds = response.data.items.map(item => item.snippet.resourceId.videoId);

      const videoDetailsResponse: AxiosResponse<{ items: VideoDetailItem[] }> = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
        headers: {
          Authorization: `Bearer ${accessToken}`
        },
        params: {
          part: 'contentDetails',
          id: videoIds.join(','),
          key: youtube_Api_Key
        }
      });

      const remainingTracks = MAX_TRACKS - totalTracksFetched;

      const newTracks: YoutubeTrack[] = response.data.items.slice(0, remainingTracks).map((item) => {
        const description = item.snippet.description.split('\n').join(' ');
        const videoDetail = videoDetailsResponse.data.items.find(video => video.id === item.snippet.resourceId.videoId);
        const duration = videoDetail ? convertDurationToMinutesAndSeconds(videoDetail.contentDetails.duration) : null;

        const publishedDate = new Date(item.snippet.publishedAt).toISOString().split('T')[0];

        return {
          trackNumber: trackCounter++,
          title: item.snippet.title,
          description: description,
          videoChannelTitle: item.snippet.videoOwnerChannelTitle,
          duration: duration,
          publishedDate: publishedDate
        };
      });

      allTracks = allTracks.concat(newTracks);
      totalTracksFetched += newTracks.length;

      pageToken = response.data.nextPageToken || '';
      url = pageToken && totalTracksFetched < MAX_TRACKS ? `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=LL&maxResults=50&pageToken=${pageToken}` : '';
    }

    youtubeTrackArray = allTracks;
    console.log("Request sent, total tracks fetched:", totalTracksFetched);

    return youtubeTrackArray;

  } catch (error) {
    throw error;
  }
};
