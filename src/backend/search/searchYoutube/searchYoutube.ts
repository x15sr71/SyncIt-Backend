import axios from "axios";
import {
  get_YoutubeAccessToken,
  refreshYoutubeAccessToken,
} from "../../../OAuth/tokenManagement/youtubeTokensUtil";

const MAX_RETRIES = 3;
const YOUTUBE_API_URL = "https://www.googleapis.com/youtube/v3/search";

const validateTracks = (tracks) => {
  if (!tracks || tracks.length === 0) {
    throw new Error("Invalid or empty tracks array");
  }
};

const getApiKey = () => {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "YouTube API key is missing. Please set it in your environment variables."
    );
  }
  return apiKey;
};

const createSearchQuery = ({ trackName, artists, albumName }) => {
  return `${trackName || ""} ${artists || ""} ${albumName || ""}`.trim();
};

const handleSearchError = async (error, track, userId) => {
  if (error.response) {
    const { status, data } = error.response;
    console.error(
      `Error response data for ${track.trackName}:`,
      JSON.stringify(data, null, 2)
    );

    if (status === 401) {
      console.warn("Access token expired or invalid. Refreshing token...");
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
      console.error(
        "Quota exceeded. Please check your quota usage or request an increase."
      );
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

const performSearch = async (track, apiKey, accessToken, userId) => {
  const searchQuery = createSearchQuery(track);

  if (!searchQuery) {
    console.error(
      `Search query for track ${track.trackName} is null or empty. Skipping search.`
    );
    return { trackName: track.trackName, results: [] };
  }

  console.log(`Searching for query: ${searchQuery}`);

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await axios.get(YOUTUBE_API_URL, {
        params: {
          part: "snippet",
          q: searchQuery,
          type: "video",
          videoCategoryId: "10",
          maxResults: 3,
          key: apiKey,
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      console.log(
        `Search results for track ${track.trackName}:`,
        response.data.items
      );
      return { trackName: track.trackName, results: response.data.items };
    } catch (error) {
      const newAccessToken = await handleSearchError(error, track, userId);
      if (newAccessToken) {
        accessToken = newAccessToken;
        continue;
      } else {
        break;
      }
    }
  }

  return { trackName: track.trackName, results: [] };
};

export const searchTracksOnYoutube = async (req, res, tracks) => {
  const userId = req.session?.id;

  if (!userId) {
    return res.status(401).json({
      error: "AUTH_ERROR",
      message: "User session not found. Please log in again.",
    });
  }

  try {
    validateTracks(tracks);
    const apiKey = getApiKey();
    let accessToken = await get_YoutubeAccessToken(userId);

    const searchPromises = tracks.map((track) =>
      performSearch(track, apiKey, accessToken, userId)
    );

    const results = await Promise.allSettled(searchPromises);

    const formattedResults = results.map((result, index) => {
      const query = createSearchQuery(tracks[index]);
      if (result.status === "fulfilled") {
        const { trackName, results: searchResults } = result.value;
        return { trackName, query, results: searchResults };
      } else {
        console.error(
          `Error searching for track ${tracks[index].trackName}:`,
          result.reason
        );
        return { trackName: tracks[index].trackName, query, results: [] };
      }
    });

    return res.json({ status: "success", data: formattedResults });
  } catch (err) {
    console.error("Unexpected error:", err.message);
    return res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred while searching YouTube.",
    });
  }
};
