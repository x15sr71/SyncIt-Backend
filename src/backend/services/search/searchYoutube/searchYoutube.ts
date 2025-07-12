// src/services/youtube/searchTracksService.ts

import axios from "axios";
import {
  get_YoutubeAccessToken,
  refreshYoutubeAccessToken,
} from "../../../../OAuth/tokenManagement/youtubeTokensUtil";

const MAX_RETRIES = 3;
const YOUTUBE_API_URL = "https://www.googleapis.com/youtube/v3/search";

type TrackInput = {
  trackName: string;
  artists?: string;
  albumName?: string;
};

type YouTubeSearchResult = {
  trackName: string;
  query: string;
  results: any[]; // you can tighten this to the exact snippet shape
};

const validateTracks = (tracks: TrackInput[]) => {
  if (!tracks || tracks.length === 0) {
    throw new Error("Invalid or empty tracks array");
  }
};

const getApiKey = (): string => {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "YouTube API key is missing. Please set it in your environment variables."
    );
  }
  return apiKey;
};

const createSearchQuery = ({ trackName, artists, albumName }: TrackInput) =>
  `${trackName || ""} ${artists || ""} ${albumName || ""}`.trim();

const handleSearchError = async (
  error: any,
  track: TrackInput,
  userId: string
): Promise<string | null> => {
  if (error.response) {
    const { status, data } = error.response;
    console.error(
      `Error response data for ${track.trackName}:`,
      JSON.stringify(data, null, 2)
    );

    if (status === 401) {
      console.warn("Access token expired. Refreshing token...");
      try {
        await refreshYoutubeAccessToken(userId);
        return await get_YoutubeAccessToken(userId);
      } catch (refreshError) {
        console.error("Failed to refresh access token:", refreshError.message);
        return null;
      }
    } else if (
      status === 403 &&
      data?.error?.errors?.[0]?.reason === "quotaExceeded"
    ) {
      console.error("Quota exceeded. Cannot proceed further.");
    } else {
      console.error(
        `Error searching for track ${track.trackName}:`,
        error.message
      );
    }
  } else {
    console.error(
      `Network error searching for track ${track.trackName}:`,
      error.message
    );
  }
  return null;
};

const performSearch = async (
  track: TrackInput,
  apiKey: string,
  accessToken: string,
  userId: string
): Promise<{ trackName: string; results: any[] }> => {
  const query = createSearchQuery(track);
  if (!query) {
    console.warn(`Empty search query for track ${track.trackName}.`);
    return { trackName: track.trackName, results: [] };
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const resp = await axios.get(YOUTUBE_API_URL, {
        params: {
          part: "snippet",
          q: query,
          type: "video",
          videoCategoryId: "10",      // Narrow to music category
          videoEmbeddable: "true",    // Only embeddable videos
          order: "relevance",         // Sort by relevance (default)
          maxResults: 3,
          key: apiKey,
        },
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return { trackName: track.trackName, results: resp.data.items };
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


/**
 * Pure service: searches YouTube for each track and returns results.
 * @param userId - your session or DB user identifier
 * @param tracks - array of { trackName, artists?, albumName? }
 */
export async function searchTracksOnYoutubeService(
  userId: string,
  tracks: TrackInput[]
): Promise<YouTubeSearchResult[]> {
  if (!userId) {
    throw new Error("AUTH_ERROR: Missing userId");
  }

  validateTracks(tracks);
  const apiKey = getApiKey();
  let accessToken = await get_YoutubeAccessToken(userId);

  // perform all searches in parallel
  const settled = await Promise.allSettled(
    tracks.map((track) => performSearch(track, apiKey, accessToken, userId))
  );

  // format results array
  return settled.map((r, idx) => {
    const query = createSearchQuery(tracks[idx]);
    if (r.status === "fulfilled") {
      return { trackName: r.value.trackName, query, results: r.value.results };
    } else {
      console.error(
        `Search failed for ${tracks[idx].trackName}:`,
        r.reason
      );
      return { trackName: tracks[idx].trackName, query, results: [] };
    }
  });
}
