import axios from 'axios';
import {
  get_YoutubeAccessToken,
  refreshYoutubeAccessToken,
} from '../../../../auth/youtube/youtubeTokensUtil';

import { mapWithConcurrency, withRetryAfter } from '../../../utility/upstream';

const MAX_RETRIES = 3;
const SEARCH_CONCURRENCY = 4;
const YOUTUBE_API_URL = 'https://www.googleapis.com/youtube/v3/search';
const VIDEO_DETAILS_API_URL = 'https://www.googleapis.com/youtube/v3/videos';

type TrackInput = {
  trackName: string;
  artists?: string;
  albumName?: string;
};

type YouTubeSearchResult = {
  trackName: string;
  query: string;
  results: any[]; // can be narrowed later
};

const validateTracks = (tracks: TrackInput[]) => {
  if (!tracks || tracks.length === 0) {
    throw new Error('Invalid or empty tracks array');
  }
};

const getApiKey = (): string => {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    throw new Error('YouTube API key is missing. Please set it in your environment variables.');
  }
  return apiKey;
};

const createSearchQuery = ({ trackName, artists, albumName }: TrackInput) =>
  `${trackName || ''} ${artists || ''} ${albumName || ''}`.trim();

const handleSearchError = async (
  error: any,
  track: TrackInput,
  userId: string,
): Promise<string | null> => {
  if (error.response) {
    const { status, data } = error.response;
    console.error(`Error response data for ${track.trackName}:`, JSON.stringify(data, null, 2));

    if (status === 401) {
      console.warn('Access token expired. Refreshing token...');
      try {
        await refreshYoutubeAccessToken(userId);
        return await get_YoutubeAccessToken(userId);
      } catch (refreshError: any) {
        console.error('Failed to refresh access token:', refreshError.message);
        return null;
      }
    } else if (status === 403 && data?.error?.errors?.[0]?.reason === 'quotaExceeded') {
      console.error('Quota exceeded. Cannot proceed further.');
    } else {
      console.error(`Error searching for track ${track.trackName}:`, error.message);
    }
  } else {
    console.error(`Network error searching for track ${track.trackName}:`, error.message);
  }
  return null;
};

// ✅ Fetch video status info for filtering (embeddable, public, processed)
async function filterValidVideos(videoIds: string[], apiKey: string): Promise<Set<string>> {
  if (videoIds.length === 0) return new Set();

  try {
    const resp = await axios.get(VIDEO_DETAILS_API_URL, {
      params: {
        part: 'status',
        id: videoIds.join(','),
        key: apiKey,
      },
    });

    const validIds = new Set<string>();

    for (const item of resp.data.items) {
      const status = item.status;
      if (
        status?.embeddable === true &&
        status?.privacyStatus === 'public' &&
        status?.uploadStatus === 'processed'
      ) {
        validIds.add(item.id);
      }
    }

    return validIds;
  } catch (err: any) {
    console.error('Failed to validate video statuses via videos.list:', err.message);
    return new Set(); // fallback to empty set = skip all
  }
}

const performSearch = async (
  track: TrackInput,
  apiKey: string,
  accessToken: string,
  userId: string,
): Promise<{ trackName: string; results: any[] }> => {
  const query = createSearchQuery(track);
  if (!query) {
    console.warn(`Empty search query for track ${track.trackName}.`);
    return { trackName: track.trackName, results: [] };
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const resp = await withRetryAfter(() =>
        axios.get(YOUTUBE_API_URL, {
          params: {
            part: 'snippet',
            q: query,
            type: 'video',
            videoCategoryId: '10',
            videoEmbeddable: 'true',
            order: 'relevance',
            maxResults: 3,
            key: apiKey,
          },
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      );

      const rawResults = resp.data.items;
      const videoIds = rawResults.map((item: any) => item.id.videoId);
      const validVideoIds = await filterValidVideos(videoIds, apiKey);

      const filtered = rawResults.filter((item: any) => validVideoIds.has(item.id.videoId));

      return { trackName: track.trackName, results: filtered };
    } catch (err: any) {
      const newToken = await handleSearchError(err, track, userId);
      if (newToken) {
        accessToken = newToken;
        continue;
      }
      break;
    }
  }

  return { trackName: track.trackName, results: [] };
};

export async function searchTracksOnYoutubeService(
  userId: string,
  tracks: TrackInput[],
): Promise<YouTubeSearchResult[]> {
  if (!userId) {
    throw new Error('AUTH_ERROR: Missing userId');
  }

  validateTracks(tracks);
  const apiKey = getApiKey();
  let accessToken = await get_YoutubeAccessToken(userId);

  // Bounded fan-out: searching every track in parallel guaranteed 429s and
  // burned quota on doomed requests (P2-3).
  return mapWithConcurrency(tracks, SEARCH_CONCURRENCY, async (track) => {
    const query = createSearchQuery(track);
    try {
      const result = await performSearch(track, apiKey, accessToken, userId);
      return { trackName: result.trackName, query, results: result.results };
    } catch (reason: any) {
      console.error(`Search failed for ${track.trackName}:`, reason);
      return { trackName: track.trackName, query, results: [] };
    }
  });
}
