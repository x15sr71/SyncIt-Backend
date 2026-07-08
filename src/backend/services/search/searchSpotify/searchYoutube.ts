import axios, { AxiosError } from 'axios';
import {
  get_YoutubeAccessToken,
  refreshYoutubeAccessToken,
} from '../../../../auth/youtube/youtubeTokensUtil';

const youtube_Api_Key = process.env.YOUTUBE_API_KEY;

const MAX_RETRIES = 5;
// Deliberate migration cap (was a silent 40): one YouTube search costs 100
// quota units, so N tracks ≈ N×150 units of the 10,000/day default budget.
// Override with MIGRATION_MAX_TRACKS once a quota increase is granted.
const MAX_TRACKS = Number(process.env.MIGRATION_MAX_TRACKS ?? 100);

// Convert ISO 8601 duration to "MM:SS"
const convertDurationToMinutesAndSeconds = (duration: string) => {
  const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
  if (!match) return '0:00';
  const hours = parseInt(match[1]) || 0;
  const minutes = parseInt(match[2]) || 0;
  const seconds = parseInt(match[3]) || 0;
  const totalMinutes = hours * 60 + minutes;
  return `${totalMinutes}:${String(seconds).padStart(2, '0')}`;
};

export const searchYoutubeTracks = async (userId: string, playlistId: string) => {
  if (!playlistId) {
    console.error('Missing playlistId');
    return {
      success: false,
      data: [],
      error: 'MISSING_PLAYLIST_ID',
      message: 'No YouTube playlist ID provided.',
    };
  }

  let retryCount = 0;

  while (retryCount < MAX_RETRIES) {
    try {
      const accessToken = await get_YoutubeAccessToken(userId);
      const { tracks: fetchedTracks, truncated } = await fetchYoutubeTracks(
        accessToken,
        playlistId,
      );
      return { success: true, data: fetchedTracks, truncated };
    } catch (error: any) {
      if (error instanceof AxiosError && error.response && error.response.status === 401) {
        const response = await refreshYoutubeAccessToken(userId);
        if (response.success) {
          retryCount += 1;
          continue;
        }
        return {
          success: false,
          data: [],
          error: 'AUTH_REFRESH_FAILED',
          message: 'Failed to refresh YouTube access token. Please log in again.',
        };
      }

      console.error(
        'Error fetching tracks:',
        error.response ? error.response.data : error.message,
      );
      return { success: false, data: [], error: 'FETCH_FAILED', message: error.message };
    }
  }

  return { success: false, data: [], error: 'MAX_RETRIES_EXCEEDED' };
};

const fetchYoutubeTracks = async (accessToken: string, playlistId: string) => {
  const url = 'https://www.googleapis.com/youtube/v3/playlistItems';
  // Function-local: never shared across concurrent requests
  const allTracks = [];
  let pageToken = '';
  let trackCounter = 1;
  let totalTracksFetched = 0;
  let truncated = false;

  while (totalTracksFetched < MAX_TRACKS) {
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: {
        part: 'snippet',
        playlistId,
        maxResults: 50,
        pageToken: pageToken || undefined,
      },
    });

    const videoIds = response.data.items.map((item: any) => item.snippet.resourceId.videoId);

    const videoDetailsResponse = await axios.get(
      'https://www.googleapis.com/youtube/v3/videos',
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: {
          part: 'contentDetails',
          id: videoIds.join(','),
          key: youtube_Api_Key,
        },
      },
    );

    const remainingTracks = MAX_TRACKS - totalTracksFetched;

    const newTracks = response.data.items.slice(0, remainingTracks).map((item: any) => {
      const description = item.snippet.description.split('\n').join(' ');
      const videoDetail = videoDetailsResponse.data.items.find(
        (video: any) => video.id === item.snippet.resourceId.videoId,
      );
      const duration = videoDetail
        ? convertDurationToMinutesAndSeconds(videoDetail.contentDetails.duration)
        : null;
      const publishedDate = new Date(item.snippet.publishedAt).toISOString().split('T')[0];

      return {
        trackNumber: trackCounter++,
        trackId: item.snippet.resourceId.videoId,
        title: item.snippet.title,
        description,
        videoChannelTitle: item.snippet.videoOwnerChannelTitle,
        duration,
        publishedDate,
      };
    });

    allTracks.push(...newTracks);
    totalTracksFetched += newTracks.length;

    const nextPage = response.data.nextPageToken;
    if (!nextPage || totalTracksFetched >= MAX_TRACKS) {
      // Surface the cap instead of silently dropping the rest (P2-1).
      truncated = !!nextPage;
      break;
    }
    pageToken = nextPage;
  }

  return { tracks: allTracks, truncated };
};
